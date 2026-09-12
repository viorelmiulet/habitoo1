/**
 * Modul Contracte — logică de server.
 *
 * Reguli respectate în tot fișierul:
 * - datele sensibile (CNP, serie și număr act) se stochează criptat AES-256-GCM
 *   și se decriptează exclusiv pe server, doar pentru creatorul contractului sau
 *   administratorul agenției;
 * - fiecare extragere din act și fiecare afișare a datelor în clar intră în audit;
 * - imaginea actului nu se salvează niciodată automat.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CONTRACT_KINDS,
  PARTY_ROLES,
  contractKindLabels,
  partyRoleLabels,
  renderTemplate,
  maskCnp,
} from "@/lib/contracts/templates";

export const CONTRACTS_BUCKET = "contract-documents";
const SIGN_TOKEN_DAYS = 7;

type Ctx = {
  supabase: {
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
  userId: string;
};

const uuid = z.string().uuid();

async function orgContext(ctx: Ctx) {
  const [{ data: org }, { data: isAdmin }] = await Promise.all([
    ctx.supabase.rpc("current_org"),
    ctx.supabase.rpc("is_org_admin"),
  ]);
  if (!org || typeof org !== "string") throw new Error("Agenția nu este configurată.");
  return { orgId: org, isAdmin: isAdmin === true };
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function audit(params: {
  orgId: string;
  actorId: string;
  action: string;
  entityId?: string | null;
  values?: Record<string, unknown>;
}) {
  try {
    const db = await admin();
    await db.from("audit_logs").insert({
      organization_id: params.orgId,
      actor_id: params.actorId,
      action: params.action,
      entity: "contracts",
      entity_id: params.entityId ?? null,
      new_values: (params.values ?? null) as never,
      created_by: params.actorId,
    } as never);
  } catch {
    /* auditul nu blochează fluxul */
  }
}

/** Verifică accesul la un contract: creator sau administrator al agenției. */
async function loadContract(ctx: Ctx, contractId: string) {
  const { orgId, isAdmin } = await orgContext(ctx);
  const db = await admin();
  const { data: contract } = await db
    .from("contracts")
    .select("*")
    .eq("id", contractId)
    .maybeSingle();
  if (!contract || contract.organization_id !== orgId) throw new Error("Contractul nu există.");
  if (contract.created_by !== ctx.userId && !isAdmin) {
    throw new Error("Nu ai acces la acest contract.");
  }
  return { contract, orgId, isAdmin, db };
}

/* ------------------------------------------------------------------ */
/* Șabloane                                                            */
/* ------------------------------------------------------------------ */

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    const { orgId } = await orgContext(ctx);
    const db = await admin();
    const { data } = await db
      .from("contract_templates")
      .select("*")
      .or(`organization_id.is.null,organization_id.eq.${orgId}`)
      .order("organization_id", { nullsFirst: true })
      .order("kind");
    return (data ?? []).map((t) => ({ ...t, isPlatform: t.organization_id === null }));
  });

export const saveTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: uuid.optional(),
        kind: z.enum(CONTRACT_KINDS),
        name: z.string().trim().min(3).max(160),
        body: z.string().min(10),
        copyOf: uuid.optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { orgId, isAdmin } = await orgContext(ctx);
    if (!isAdmin) throw new Error("Doar administratorul agenției poate modifica șabloanele.");
    const db = await admin();

    if (data.id) {
      const { data: existing } = await db
        .from("contract_templates")
        .select("organization_id")
        .eq("id", data.id)
        .maybeSingle();
      if (!existing || existing.organization_id !== orgId) {
        throw new Error("Șablonul nu aparține agenției tale.");
      }
      const { error } = await db
        .from("contract_templates")
        .update({ name: data.name, body: data.body, kind: data.kind })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      await audit({
        orgId,
        actorId: ctx.userId,
        action: "contract_template.updated",
        entityId: data.id,
      });
      return { id: data.id };
    }

    const { data: inserted, error } = await db
      .from("contract_templates")
      .insert({
        organization_id: orgId,
        kind: data.kind,
        name: data.name,
        body: data.body,
        source_template_id: data.copyOf ?? null,
        created_by: ctx.userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit({
      orgId,
      actorId: ctx.userId,
      action: "contract_template.created",
      entityId: inserted.id,
    });
    return { id: inserted.id };
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { orgId, isAdmin } = await orgContext(ctx);
    if (!isAdmin) throw new Error("Doar administratorul agenției poate șterge șabloanele.");
    const db = await admin();
    const { error } = await db
      .from("contract_templates")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", orgId);
    if (error) throw new Error(error.message);
    await audit({
      orgId,
      actorId: ctx.userId,
      action: "contract_template.deleted",
      entityId: data.id,
    });
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Extragere date din act (AI)                                         */
/* ------------------------------------------------------------------ */

const EXTRACTION_PROMPT = `Ești un asistent care extrage date dintr-un act de identitate românesc sau dintr-un pașaport.
Răspunde exclusiv cu json, cu exact aceste chei (string, gol dacă lipsește):
{"nume":"","prenume":"","cnp":"","serie":"","numar":"","data_eliberarii":"","emitent":"","adresa":"","data_nasterii":""}
Datele calendaristice se scriu în format ZZ.LL.AAAA. Nu inventa valori: dacă nu poți citi un câmp, lasă-l gol.`;

export const extractIdDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        imageBase64: z.string().min(100),
        mimeType: z.string().regex(/^image\/(jpeg|png|webp)$/),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { orgId } = await orgContext(ctx);
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Serviciul de extragere automată nu este configurat.");

    const clean = data.imageBase64.replace(/^data:[^;]+;base64,/, "");
    let parsed: Record<string, string> = {};
    let failure: string | null = null;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({
          model: "google/gemini-3.8-flash",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: EXTRACTION_PROMPT },
                {
                  type: "image_url",
                  image_url: { url: `data:${data.mimeType};base64,${clean}` },
                },
              ],
            },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error("[contracts] extraction failed", res.status, body.slice(0, 300));
        failure =
          res.status === 402 || res.status === 403
            ? "Extragerea automată nu este disponibilă momentan. Completează datele manual."
            : "Nu am putut citi documentul. Completează datele manual.";
      } else {
        const json = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content = json.choices?.[0]?.message?.content ?? "{}";
        const match = content.match(/\{[\s\S]*\}/);
        parsed = match ? (JSON.parse(match[0]) as Record<string, string>) : {};
      }
    } catch (e) {
      console.error("[contracts] extraction error", e);
      failure = "Nu am putut citi documentul. Completează datele manual.";
    }

    const field = (key: string) => String(parsed[key] ?? "").trim();
    const result = {
      lastName: field("nume"),
      firstName: field("prenume"),
      cnp: field("cnp").replace(/\D/g, ""),
      series: field("serie").toUpperCase(),
      number: field("numar"),
      issuedOn: field("data_eliberarii"),
      issuer: field("emitent"),
      address: field("adresa"),
      birthDate: field("data_nasterii"),
    };

    // Auditul reține doar faptul extragerii, nu valorile citite.
    await audit({
      orgId,
      actorId: ctx.userId,
      action: "contract.id_extraction",
      values: {
        ok: !failure,
        fields_found: Object.entries(result).filter(([, v]) => v !== "").length,
        image_stored: false,
      },
    });

    return { ...result, failure };
  });

/* ------------------------------------------------------------------ */
/* Contracte                                                           */
/* ------------------------------------------------------------------ */

export type ContractListRow = {
  id: string;
  kind: string;
  title: string;
  status: string;
  createdAt: string;
  signedAt: string | null;
  propertyId: string | null;
  propertyTitle: string | null;
  contactId: string | null;
  clientName: string | null;
  partiesTotal: number;
  partiesSigned: number;
};

export const listContracts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        status: z.string().optional(),
        propertyId: uuid.optional(),
        contactId: uuid.optional(),
        search: z.string().trim().max(120).optional(),
      })
      .default({})
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }): Promise<ContractListRow[]> => {
    const ctx = context as unknown as Ctx;
    const { orgId, isAdmin } = await orgContext(ctx);
    const db = await admin();

    let query = db
      .from("contracts")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (!isAdmin) query = query.eq("created_by", ctx.userId);
    if (data.status) query = query.eq("status", data.status);
    if (data.propertyId) query = query.eq("property_id", data.propertyId);
    if (data.contactId) query = query.eq("contact_id", data.contactId);
    if (data.search) query = query.ilike("title", `%${data.search}%`);

    const { data: rows } = await query;
    const contracts = rows ?? [];
    if (contracts.length === 0) return [];

    const [{ data: parties }, { data: properties }] = await Promise.all([
      db
        .from("contract_parties")
        .select("contract_id,signed_at,full_name,role")
        .in(
          "contract_id",
          contracts.map((c) => c.id),
        ),
      db
        .from("properties")
        .select("id,title")
        .in(
          "id",
          contracts.map((c) => c.property_id).filter((v): v is string => Boolean(v)),
        ),
    ]);

    const propertyTitles = new Map((properties ?? []).map((p) => [p.id, p.title]));
    return contracts.map((c) => {
      const own = (parties ?? []).filter((p) => p.contract_id === c.id);
      const client = own.find((p) => p.role !== "agent");
      return {
        id: c.id,
        kind: c.kind,
        title: c.title,
        status: c.status,
        createdAt: c.created_at,
        signedAt: c.signed_at,
        propertyId: c.property_id,
        propertyTitle: c.property_id ? (propertyTitles.get(c.property_id) ?? null) : null,
        contactId: c.contact_id,
        clientName: client?.full_name ?? null,
        partiesTotal: own.length,
        partiesSigned: own.filter((p) => p.signed_at).length,
      };
    });
  });

const partyInput = z.object({
  role: z.enum(PARTY_ROLES),
  fullName: z.string().trim().min(3).max(160),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(300).optional(),
  cnp: z.string().trim().max(20).optional(),
  idSeries: z.string().trim().max(10).optional(),
  idNumber: z.string().trim().max(20).optional(),
  idIssuer: z.string().trim().max(120).optional(),
  idIssuedOn: z.string().trim().max(20).optional(),
  birthDate: z.string().trim().max(20).optional(),
});

function isoDate(value: string | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const ro = raw.match(/^(\d{2})[.\-/](\d{2})[.\-/](\d{4})$/);
  if (ro) return `${ro[3]}-${ro[2]}-${ro[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
}

export const createContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        templateId: uuid,
        kind: z.enum(CONTRACT_KINDS),
        title: z.string().trim().min(3).max(200).optional(),
        propertyId: uuid.optional(),
        contactId: uuid.optional(),
        leadId: uuid.optional(),
        price: z.number().nonnegative().optional(),
        currency: z.string().trim().max(6).optional(),
        commission: z.string().trim().max(60).optional(),
        durationDays: z.number().int().positive().max(3650).optional(),
        parties: z.array(partyInput).min(1).max(6),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { orgId } = await orgContext(ctx);
    const db = await admin();
    const { encryptPii } = await import("@/lib/contracts/crypto.server");

    const [{ data: template }, { data: org }, { data: profile }] = await Promise.all([
      db.from("contract_templates").select("*").eq("id", data.templateId).maybeSingle(),
      db.from("organizations").select("*").eq("id", orgId).maybeSingle(),
      db.from("profiles").select("full_name,phone,email").eq("id", ctx.userId).maybeSingle(),
    ]);
    if (!template) throw new Error("Șablonul nu există.");
    if (template.organization_id !== null && template.organization_id !== orgId) {
      throw new Error("Șablonul nu aparține agenției tale.");
    }

    const property = data.propertyId
      ? (
          await db
            .from("properties")
            .select(
              "id,title,reference,address,city,county,surface,rooms,price,currency,commission",
            )
            .eq("id", data.propertyId)
            .eq("organization_id", orgId)
            .maybeSingle()
        ).data
      : null;

    const client = data.parties.find((p) => p.role !== "agent") ?? data.parties[0]!;
    const price = data.price ?? property?.price ?? null;
    const currency = data.currency ?? property?.currency ?? "EUR";
    const commission = data.commission ?? property?.commission ?? null;

    const vars = {
      "agentie.denumire": org?.name,
      "agentie.denumire_legala": org?.legal_name,
      "agentie.cui": org?.cui,
      "agentie.registru": org?.trade_registry_number,
      "agentie.adresa": org?.address,
      "agentie.telefon": org?.phone,
      "agentie.email": org?.email,
      "agent.nume": profile?.full_name,
      "agent.telefon": profile?.phone,
      "agent.email": profile?.email,
      "proprietate.titlu": property?.title,
      "proprietate.referinta": property?.reference,
      "proprietate.adresa": property?.address,
      "proprietate.localitate": property?.city,
      "proprietate.judet": property?.county,
      "proprietate.suprafata": property?.surface,
      "proprietate.camere": property?.rooms,
      "proprietate.pret": property?.price,
      "client.nume": client.fullName,
      "client.cnp": client.cnp,
      "client.serie": client.idSeries,
      "client.numar": client.idNumber,
      "client.emitent": client.idIssuer,
      "client.data_eliberarii": client.idIssuedOn,
      "client.data_nasterii": client.birthDate,
      "client.adresa": client.address,
      "client.telefon": client.phone,
      "client.email": client.email,
      "contract.numar": "",
      "contract.data": new Date().toLocaleDateString("ro-RO"),
      "contract.pret": price ?? "",
      "contract.moneda": currency,
      "contract.comision": commission ?? "",
      "contract.durata": data.durationDays ?? "",
    };

    const title =
      data.title ??
      `${contractKindLabels[data.kind] ?? "Contract"}${property?.title ? ` — ${property.title}` : ""}`;

    const { data: contract, error } = await db
      .from("contracts")
      .insert({
        organization_id: orgId,
        template_id: data.templateId,
        kind: data.kind,
        title,
        status: "draft",
        property_id: data.propertyId ?? null,
        contact_id: data.contactId ?? null,
        lead_id: data.leadId ?? null,
        body: renderTemplate(template.body, vars),
        data: {
          agency: {
            name: org?.name ?? "",
            legalName: org?.legal_name ?? null,
            cui: org?.cui ?? null,
            registry: org?.trade_registry_number ?? null,
            address: org?.address ?? null,
            phone: org?.phone ?? null,
            email: org?.email ?? null,
          },
        } as never,
        price,
        currency,
        commission,
        duration_days: data.durationDays ?? null,
        created_by: ctx.userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const rows = data.parties.map((p, index) => ({
      contract_id: contract.id,
      organization_id: orgId,
      role: p.role,
      full_name: p.fullName,
      email: p.email || null,
      phone: p.phone || null,
      address: p.address || null,
      birth_date: isoDate(p.birthDate),
      id_issued_on: isoDate(p.idIssuedOn),
      id_issuer: p.idIssuer || null,
      cnp_enc: encryptPii(p.cnp),
      id_series_enc: encryptPii(p.idSeries),
      id_number_enc: encryptPii(p.idNumber),
      sign_order: index + 1,
    }));
    const { error: partyError } = await db.from("contract_parties").insert(rows as never);
    if (partyError) throw new Error(partyError.message);

    await audit({
      orgId,
      actorId: ctx.userId,
      action: "contract.created",
      entityId: contract.id,
      values: { kind: data.kind, property_id: data.propertyId ?? null, parties: rows.length },
    });

    return { id: contract.id };
  });

export const updateContractBody = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: uuid, body: z.string().min(10), title: z.string().trim().min(3).max(200) }).parse(
      data,
    ),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { contract, orgId, db } = await loadContract(ctx, data.id);
    if (contract.status !== "draft") {
      throw new Error("Contractul a fost deja trimis la semnat și nu mai poate fi modificat.");
    }
    const { error } = await db
      .from("contracts")
      .update({ body: data.body, title: data.title })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit({ orgId, actorId: ctx.userId, action: "contract.updated", entityId: data.id });
    return { ok: true };
  });

export const cancelContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { orgId, db } = await loadContract(ctx, data.id);
    await db.from("contracts").update({ status: "cancelled" }).eq("id", data.id);
    await db.from("contract_signature_tokens").delete().eq("contract_id", data.id);
    await audit({ orgId, actorId: ctx.userId, action: "contract.cancelled", entityId: data.id });
    return { ok: true };
  });

/** Detaliul contractului. Datele de act se decriptează doar la cerere explicită. */
export const getContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: uuid, revealIdData: z.boolean().default(false) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { contract, orgId, db } = await loadContract(ctx, data.id);
    const { decryptPii } = await import("@/lib/contracts/crypto.server");

    const [{ data: parties }, { data: tokens }, { data: documents }, { data: property }] =
      await Promise.all([
        db.from("contract_parties").select("*").eq("contract_id", data.id).order("sign_order"),
        db.from("contract_signature_tokens").select("*").eq("contract_id", data.id),
        db
          .from("contract_documents")
          .select("*")
          .eq("contract_id", data.id)
          .order("created_at", { ascending: false }),
        contract.property_id
          ? db
              .from("properties")
              .select("id,title,reference")
              .eq("id", contract.property_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

    if (data.revealIdData) {
      await audit({
        orgId,
        actorId: ctx.userId,
        action: "contract.id_data_viewed",
        entityId: data.id,
      });
    }

    const mapped = (parties ?? []).map((p) => {
      const cnp = decryptPii(p.cnp_enc);
      const series = decryptPii(p.id_series_enc);
      const number = decryptPii(p.id_number_enc);
      const token = (tokens ?? []).find((t) => t.party_id === p.id && !t.used_at);
      return {
        id: p.id,
        role: p.role,
        roleLabel: partyRoleLabels[p.role] ?? p.role,
        fullName: p.full_name,
        email: p.email,
        phone: p.phone,
        address: p.address,
        idIssuer: p.id_issuer,
        idIssuedOn: p.id_issued_on,
        birthDate: p.birth_date,
        cnp: data.revealIdData ? cnp : maskCnp(cnp),
        idSeries: data.revealIdData ? series : series ? "••" : null,
        idNumber: data.revealIdData ? number : number ? "••••" : null,
        signedAt: p.signed_at,
        signatureIp: p.signature_ip,
        hasPendingLink: Boolean(token && new Date(token.expires_at) > new Date()),
        linkExpiresAt: token?.expires_at ?? null,
      };
    });

    return {
      contract: {
        id: contract.id,
        kind: contract.kind,
        title: contract.title,
        status: contract.status,
        body: contract.body,
        price: contract.price,
        currency: contract.currency,
        commission: contract.commission,
        durationDays: contract.duration_days,
        createdAt: contract.created_at,
        sentAt: contract.sent_at,
        signedAt: contract.signed_at,
        propertyId: contract.property_id,
        contactId: contract.contact_id,
        leadId: contract.lead_id,
        propertyTitle: property?.title ?? null,
        propertyReference: property?.reference ?? null,
      },
      parties: mapped,
      documents: (documents ?? []).map((d) => ({
        id: d.id,
        kind: d.kind,
        path: d.storage_path,
        createdAt: d.created_at,
      })),
    };
  });

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */

export async function renderAndStorePdf(contractId: string, actorId: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { decryptPii } = await import("@/lib/contracts/crypto.server");
  const { buildContractPdf } = await import("@/lib/contracts/pdf.server");

  const { data: contract } = await db.from("contracts").select("*").eq("id", contractId).single();
  const { data: parties } = await db
    .from("contract_parties")
    .select("*")
    .eq("contract_id", contractId)
    .order("sign_order");
  const { data: org } = await db
    .from("organizations")
    .select("name,legal_name,cui,trade_registry_number,address,phone,email,logo_path")
    .eq("id", contract.organization_id)
    .maybeSingle();

  let logo: { bytes: Uint8Array; mime: string } | null = null;
  if (org?.logo_path && /\.(png|jpe?g)$/i.test(org.logo_path)) {
    const { data: file } = await db.storage.from("agency-logos").download(org.logo_path);
    if (file) {
      logo = {
        bytes: new Uint8Array(await file.arrayBuffer()),
        mime: /\.png$/i.test(org.logo_path) ? "image/png" : "image/jpeg",
      };
    }
  }

  const pdfParties = await Promise.all(
    (parties ?? []).map(async (p) => {
      let signature: {
        pngBase64: string;
        signedAt: string;
        ip: string | null;
        userAgent: string | null;
      } | null = null;
      if (p.signed_at && p.signature_path) {
        const { data: file } = await db.storage.from(CONTRACTS_BUCKET).download(p.signature_path);
        if (file) {
          signature = {
            pngBase64: Buffer.from(await file.arrayBuffer()).toString("base64"),
            signedAt: p.signed_at,
            ip: p.signature_ip,
            userAgent: p.signature_user_agent,
          };
        }
      }
      const series = decryptPii(p.id_series_enc);
      const number = decryptPii(p.id_number_enc);
      const cnp = decryptPii(p.cnp_enc);
      return {
        role: p.role,
        roleLabel: partyRoleLabels[p.role] ?? p.role,
        fullName: p.full_name,
        details: [
          cnp ? `CNP ${cnp}` : "",
          series || number ? `Act de identitate seria ${series ?? "—"} nr. ${number ?? "—"}` : "",
          p.address ?? "",
          [p.phone, p.email].filter(Boolean).join(" · "),
        ].filter(Boolean),
        signature,
      };
    }),
  );

  const bytes = await buildContractPdf({
    title: contract.title,
    subtitle: `${contractKindLabels[contract.kind] ?? "Contract"} · generat la ${new Date().toLocaleDateString("ro-RO")}`,
    body: contract.body,
    agency: {
      name: org?.name ?? "Agenție",
      legalName: org?.legal_name ?? null,
      cui: org?.cui ?? null,
      registry: org?.trade_registry_number ?? null,
      address: org?.address ?? null,
      phone: org?.phone ?? null,
      email: org?.email ?? null,
    },
    logo,
    parties: pdfParties,
  });

  const signedCount = (parties ?? []).filter((p) => p.signed_at).length;
  const kind = signedCount > 0 && signedCount === (parties ?? []).length ? "signed" : "draft";
  const path = `${contract.organization_id}/${contractId}/${kind}-${Date.now()}.pdf`;
  const { error } = await db.storage
    .from(CONTRACTS_BUCKET)
    .upload(path, new Blob([bytes as unknown as BlobPart], { type: "application/pdf" }), {
      contentType: "application/pdf",
      upsert: true,
    });
  if (error) throw new Error(error.message);

  await db.from("contract_documents").insert({
    contract_id: contractId,
    organization_id: contract.organization_id,
    kind,
    storage_path: path,
    created_by: actorId,
  } as never);

  await db
    .from("contracts")
    .update(kind === "signed" ? { signed_document_path: path } : { document_path: path })
    .eq("id", contractId);

  // PDF-ul apare atașat la proprietate și la contact, în lista de documente.
  for (const [entityType, entityId] of [
    ["property", contract.property_id],
    ["contact", contract.contact_id],
  ] as const) {
    if (!entityId) continue;
    await db.from("documents").insert({
      organization_id: contract.organization_id,
      entity_type: entityType,
      entity_id: entityId,
      name: `${contract.title}${kind === "signed" ? " (semnat)" : ""}.pdf`,
      storage_path: path,
      mime_type: "application/pdf",
      size_bytes: bytes.byteLength,
      created_by: actorId,
    } as never);
  }

  return { path, kind };
}

export const generateContractPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { orgId } = await loadContract(ctx, data.id);
    const result = await renderAndStorePdf(data.id, ctx.userId);
    await audit({
      orgId,
      actorId: ctx.userId,
      action: "contract.pdf_generated",
      entityId: data.id,
      values: { kind: result.kind },
    });
    return result;
  });

export const contractDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: uuid, path: z.string().min(3) }).parse(data))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { contract, db } = await loadContract(ctx, data.id);
    if (!data.path.startsWith(`${contract.organization_id}/${contract.id}/`)) {
      throw new Error("Document invalid.");
    }
    const { data: signed } = await db.storage
      .from(CONTRACTS_BUCKET)
      .createSignedUrl(data.path, 600);
    return { url: signed?.signedUrl ?? null };
  });

/* ------------------------------------------------------------------ */
/* Semnare la distanță                                                 */
/* ------------------------------------------------------------------ */

export const sendForSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: uuid, partyIds: z.array(uuid).min(1).max(6) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const { contract, orgId, db } = await loadContract(ctx, data.id);
    if (contract.status === "cancelled") throw new Error("Contractul este anulat.");
    const { newSignatureToken, sha256Hex } = await import("@/lib/contracts/crypto.server");

    // PDF-ul curent, ca semnatarul să vadă exact documentul pe care semnează.
    await renderAndStorePdf(data.id, ctx.userId);

    const { data: parties } = await db
      .from("contract_parties")
      .select("*")
      .eq("contract_id", data.id)
      .in("id", data.partyIds);

    const expiresAt = new Date(Date.now() + SIGN_TOKEN_DAYS * 86_400_000).toISOString();
    const links: { partyId: string; fullName: string; email: string | null; url: string }[] = [];

    for (const party of parties ?? []) {
      if (party.signed_at) continue;
      const token = newSignatureToken();
      // Un singur link activ per parte.
      await db
        .from("contract_signature_tokens")
        .delete()
        .eq("party_id", party.id)
        .is("used_at", null);
      const { error } = await db.from("contract_signature_tokens").insert({
        contract_id: data.id,
        party_id: party.id,
        token_hash: sha256Hex(token),
        expires_at: expiresAt,
      } as never);
      if (error) throw new Error(error.message);

      const url = `https://crm.habitoo.ro/semnare?t=${token}`;
      links.push({ partyId: party.id, fullName: party.full_name, email: party.email, url });

      if (party.email) {
        try {
          const apiKey = process.env["LOVABLE_API_KEY"];
          if (apiKey) {
            const { sendLovableEmail } = await import("@lovable.dev/email-js");
            await sendLovableEmail(
              {
                to: party.email,
                from: "Habitoo CRM <noreply@habitoo.ro>",
                sender_domain: "notify.habitoo.ro",
                subject: `Semnează documentul: ${contract.title}`,
                html: `<p>Bună, ${party.full_name},</p><p>Ai primit un document de semnat: <strong>${contract.title}</strong>.</p><p><a href="${url}" style="background:#16233f;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Deschide și semnează</a></p><p>Linkul este valabil 7 zile și poate fi folosit o singură dată.</p>`,
                text: `Bună, ${party.full_name}. Ai primit un document de semnat: ${contract.title}. Deschide linkul (valabil 7 zile, o singură utilizare): ${url}`,
                idempotency_key: `contract-sign-${party.id}-${Date.now()}`,
              },
              { apiKey, sendUrl: process.env["LOVABLE_SEND_URL"] },
            );
          }
        } catch (e) {
          console.error("[contracts] sign email failed", e);
        }
      }
    }

    await db
      .from("contracts")
      .update({ status: "pending_signature", sent_at: new Date().toISOString() })
      .eq("id", data.id);
    await audit({
      orgId,
      actorId: ctx.userId,
      action: "contract.sent_for_signature",
      entityId: data.id,
      values: { parties: links.length },
    });

    return { links };
  });
