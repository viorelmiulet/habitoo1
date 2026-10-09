/**
 * Lead-urile trimise de Properstar (POST JSON, HTTP Basic Auth).
 * Coduri: 200 succes; 400/401/403/404/409 erori critice (Properstar nu
 * reîncearcă); 429 și 500 sunt temporare (Properstar reîncearcă de 5 ori).
 * Fiecare cerere, inclusiv cele respinse, intră în `portal_webhook_events`,
 * fără antetul Authorization.
 */
import { createHash, timingSafeEqual } from "crypto";
import { z } from "zod";
import { normalizePhoneE164 } from "@/lib/collector/normalize";
import { properstarEntityId } from "./mapper";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

export const PROPERSTAR_LEAD_SOURCE = "Properstar";
export const PROPERSTAR_LEADS_RATE_LIMIT = 120;
const DUPLICATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOGGED_HEADERS = ["content-type", "user-agent", "x-forwarded-for", "cf-connecting-ip", "x-request-id"];

export type ProperstarLeadResponse = { status: number; body: Record<string, unknown> };

/** Text simplu din HTML: fără etichete, entitățile decodate, maximum 5.000 de caractere. */
export function htmlToPlainText(input: string | null | undefined, max = 5000): string | null {
  if (!input) return null;
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  const text = input
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => safeChar(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n: string) => named[n.toLowerCase()] ?? m)
    .replace(/[ \t\f\v\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text ? text.slice(0, max) : null;
}

function safeChar(code: number): string {
  return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
}

const sha = (v: string) => createHash("sha256").update(v, "utf8").digest();

/** Perechea utilizator + parolă, comparată în timp constant (ambele, mereu). */
export function verifyBasicAuth(header: string | null, user: string | undefined, password: string | undefined): boolean {
  if (!user || !password || !header) return false;
  const m = /^Basic\s+(.+)$/i.exec(header.trim());
  if (!m) return false;
  let decoded = "";
  try {
    decoded = Buffer.from(m[1]!, "base64").toString("utf8");
  } catch {
    return false;
  }
  const idx = decoded.indexOf(":");
  if (idx < 0) return false;
  const okUser = timingSafeEqual(sha(decoded.slice(0, idx)), sha(user));
  const okPass = timingSafeEqual(sha(decoded.slice(idx + 1)), sha(password));
  return okUser && okPass;
}

const payloadSchema = z.object({
  listing_id: z.union([z.string(), z.number()]).transform((v) => String(v).trim()).pipe(z.string().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/)),
  agency_id: z.string().trim().max(64).optional().nullable(),
  agent_id: z.string().trim().max(64).optional().nullable(),
  lead_name: z.string().trim().max(200).optional().nullable(),
  lead_email: z.string().trim().max(255).optional().nullable(),
  lead_phone: z.string().trim().max(40).optional().nullable(),
  message: z.string().max(100_000).optional().nullable(),
  gateway: z.string().trim().max(100).optional().nullable(),
  test: z.boolean().optional(),
});

function err(status: number, code: string, message: string): ProperstarLeadResponse {
  return { status, body: { status: "error", code, message } };
}

export const PROPERSTAR_RELAY_DOMAIN = "@reply.properstar.com";
export const PROPERSTAR_DIRECT_NOTE = "Mesaj direct către agent (pagina de agent Properstar)";
export const PROPERSTAR_HIDDEN_CONTACT_NOTE =
  "Contact ascuns de Properstar: răspunde la adresa de email (releu Properstar)";

/** Tipul cererii, după textul mesajului Properstar. */
export function properstarRequestKind(message: string | null, direct: boolean): { label: string; preferredDate: string | null } {
  if (direct) return { label: "Mesaj direct către agent", preferredDate: null };
  const text = message ?? "";
  if (/take a tour|preferred date/i.test(text)) {
    const m = /Preferred date:\s*(.+?)(?:\s*⚠|\n|$)/i.exec(text);
    return { label: "Cerere vizionare", preferredDate: m?.[1]?.trim() || null };
  }
  if (/exact address/i.test(text)) return { label: "Cerere adresă", preferredDate: null };
  return { label: "Mesaj general", preferredDate: null };
}

type PropertyRow = { id: string; organization_id: string; assigned_to: string | null; title: string | null; reference: string | null };

export async function handleProperstarLead(
  admin: Admin,
  req: { rawBody: string; authorization: string | null; headers: Record<string, string> },
  env: { user: string | undefined; password: string | undefined; now?: () => Date },
): Promise<ProperstarLeadResponse> {
  const now = env.now?.() ?? new Date();
  let parsed: unknown = null;
  let organizationId: string | null = null;
  let authOk = false;
  let isTest = false;

  const finish = async (res: ProperstarLeadResponse, reason: string): Promise<ProperstarLeadResponse> => {
    const code = (res.body["code"] as string | undefined) ?? "success";
    try {
      await admin.from("portal_webhook_events").insert({
        portal: "properstar",
        http_method: "POST",
        headers: req.headers,
        raw_payload: req.rawBody.slice(0, 20_000),
        parsed_payload: (parsed ?? null) as never,
        organization_id: organizationId,
        signature_present: Boolean(req.authorization),
        signature_valid: authOk,
        signature_note: "basic_auth",
        processed: res.status === 200 && !isTest,
        process_note: `${res.status} ${code}${isTest ? " [test]" : ""}: ${reason}`.slice(0, 1000),
      });
    } catch {
      // Jurnalul nu blochează răspunsul.
    }
    return res;
  };

  try {
    const rl = await admin.rpc("rate_limit_hit", { _bucket: "properstar_leads", _limit: PROPERSTAR_LEADS_RATE_LIMIT, _window_seconds: 60 });
    if (rl.data === false) return finish(err(429, "rate_limited", "Too many requests. Retry later."), "rate limit");

    authOk = verifyBasicAuth(req.authorization, env.user, env.password);
    if (!authOk) return finish(err(401, "unauthorized", "Missing or invalid credentials."), "basic auth failed");

    try {
      parsed = JSON.parse(req.rawBody);
    } catch {
      return finish(err(400, "invalid_payload", "Body must be valid JSON."), "invalid json");
    }
    const result = payloadSchema.safeParse(parsed);
    if (!result.success) {
      const field = result.error.issues[0]?.path[0];
      const msg = field === "listing_id" ? "listing_id is required." : `Invalid field: ${String(field ?? "body")}.`;
      return finish(err(400, "invalid_payload", msg), msg);
    }
    const p = result.data;
    isTest = p.test === true;
    const email = p.lead_email ? p.lead_email.toLowerCase() : null;
    const phone = p.lead_phone && p.lead_phone.trim() ? normalizePhoneE164(p.lead_phone) : null;
    if (!email && !phone) return finish(err(400, "invalid_payload", "lead_email or lead_phone is required."), "no contact");
    if (email && !z.string().email().safeParse(email).success) return finish(err(400, "invalid_payload", "lead_email is invalid."), "invalid email");

    const [{ data: conns, error: connErr }, { data: orgs, error: orgErr }] = await Promise.all([
      admin.from("portal_connections").select("organization_id").eq("portal", "properstar").eq("activated", true),
      admin.from("organizations").select("id, name"),
    ]);
    if (connErr) throw connErr;
    if (orgErr) throw orgErr;
    const enabled = new Set((conns ?? []).map((c: { organization_id: string }) => c.organization_id));
    const orgName = new Map((orgs ?? []).map((o: { id: string; name: string }) => [o.id, o.name]));

    let agencyOrgId: string | null = null;
    if (p.agency_id) {
      const hit = (orgs ?? []).find((o: { id: string }) => properstarEntityId("hb", o.id) === p.agency_id);
      if (!hit || !enabled.has(hit.id)) {
        organizationId = hit?.id ?? null;
        return finish(err(403, "agency_not_enabled", "Agency is unknown or Properstar is not enabled."), `agency ${p.agency_id}`);
      }
      agencyOrgId = hit.id;
      organizationId = hit.id;
    }

    // Agentul din feed (AgentId = properstarEntityId("ag", userId)), căutat printre membrii agenției.
    const direct = Boolean(p.listing_id.startsWith("ag") || (p.agent_id && p.listing_id === p.agent_id));
    const agentKey = p.agent_id || (direct ? p.listing_id : null);
    let agent: { id: string; full_name: string | null; organization_id: string } | null = null;
    if (agentKey) {
      let aq = admin.from("profiles").select("id, full_name, organization_id");
      aq = agencyOrgId ? aq.eq("organization_id", agencyOrgId) : aq.in("organization_id", [...enabled]);
      const { data: members, error: memErr } = await aq;
      if (memErr) throw memErr;
      agent =
        ((members ?? []) as { id: string; full_name: string | null; organization_id: string }[]).find(
          (m) => properstarEntityId("ag", m.id) === agentKey,
        ) ?? null;
    }
    if (direct && !agent) {
      return finish(err(404, "agent_not_found", "Agent not found in this agency."), `agent ${agentKey}`);
    }

    let q = admin
      .from("properties")
      .select("id, organization_id, assigned_to, title, reference")
      .is("deleted_at", null)
      .limit(20);
    q = UUID_RE.test(p.listing_id) ? q.eq("id", p.listing_id.toLowerCase()) : q.eq("reference", p.listing_id);
    if (agencyOrgId) q = q.eq("organization_id", agencyOrgId);
    const { data: props, error: propErr } = await q;
    if (propErr) throw propErr;
    const all = (props ?? []) as PropertyRow[];
    const candidates = all.filter((r) => enabled.has(r.organization_id));

    let property: PropertyRow | null = null;
    if (direct) {
      // Mesaj de pe pagina agentului: nu există anunț.
    } else if (candidates.length > 1 && !agencyOrgId) {
      return finish(err(409, "ambiguous_listing", "listing_id matches several agencies; send agency_id."), `ambiguous ${p.listing_id}`);
    }
    if (candidates.length >= 1) property = candidates[0]!;
    else if (all.length > 0) {
      organizationId = all[0]!.organization_id;
      return finish(err(403, "agency_not_enabled", "Properstar is not enabled for this agency."), `listing ${p.listing_id}`);
    } else if (!agencyOrgId) {
      return finish(err(404, "listing_not_found", "Listing not found."), `listing ${p.listing_id}`);
    }

    if (agent && property && agent.organization_id !== property.organization_id) agent = null;
    organizationId = property?.organization_id ?? agencyOrgId ?? agent?.organization_id ?? null;
    const orgId = organizationId!;
    const assignedTo = agent?.id ?? property?.assigned_to ?? null;
    let agentName: string | null = agent?.full_name ?? null;
    if (!agent && property?.assigned_to) {
      const { data: prof } = await admin.from("profiles").select("full_name").eq("id", property.assigned_to).maybeSingle();
      agentName = prof?.full_name ?? null;
    }
    const listingLabel = direct ? null : (property?.reference ?? property?.id ?? p.listing_id);

    if (isTest) {
      return finish(
        {
          status: 200,
          body: {
            status: "success",
            test: true,
            ...(direct ? { direct: true } : {}),
            listing: listingLabel,
            agency: orgName.get(orgId) ?? null,
            agent: agentName,
          },
        },
        direct ? `test ok direct agent ${agentKey}` : property ? `test ok ${listingLabel}` : `test ok, listing ${p.listing_id} not found in agency`,
      );
    }

    const bodyText = htmlToPlainText(p.message);
    const sentAt = now.toISOString();

    // Aceeași cerere (proprietate, persoană, mesaj) în 7 zile → același lead.
    let dup = admin
      .from("portal_messages")
      .select("lead_id")
      .eq("portal", "properstar")
      .eq("organization_id", orgId)
      .gte("created_at", new Date(now.getTime() - DUPLICATE_WINDOW_MS).toISOString())
      .not("lead_id", "is", null)
      .limit(1);
    dup = property ? dup.eq("property_id", property.id) : dup.is("property_id", null);
    dup = email ? dup.eq("sender_email", email) : dup.eq("sender_phone", phone!);
    dup = bodyText ? dup.eq("body", bodyText) : dup.is("body", null);
    const { data: dupRow, error: dupErr } = await dup.maybeSingle();
    if (dupErr) throw dupErr;
    if (dupRow?.lead_id) {
      return finish({ status: 200, body: { status: "success", lead_id: dupRow.lead_id, duplicate: true } }, `duplicate of ${dupRow.lead_id}`);
    }

    const name = p.lead_name?.trim() || "Contact Properstar";
    const missingNote = property || direct ? null : `Anunț Properstar ${p.listing_id} negăsit`;
    const kind = properstarRequestKind(bodyText, direct);
    const kindLine = `Tip cerere: ${kind.label}${kind.preferredDate ? ` (data preferată: ${kind.preferredDate})` : ""}`;
    const hiddenNote = email?.endsWith(PROPERSTAR_RELAY_DOMAIN) ? PROPERSTAR_HIDDEN_CONTACT_NOTE : null;
    const directNote = direct ? PROPERSTAR_DIRECT_NOTE : null;
    const noteLine = [
      directNote,
      missingNote,
      kindLine,
      hiddenNote,
      [`Mesaj Properstar (${sentAt})`, bodyText].filter(Boolean).join(":\n"),
    ]
      .filter(Boolean)
      .join("\n");
    const { ingestPortalLead } = await import("@/lib/portals/lead-ingest.server");
    const { portalMessageExpiry } = await import("@/lib/portals/storia/leads.server");
    const outcome = await ingestPortalLead(admin, {
      portal: "properstar",
      source: PROPERSTAR_LEAD_SOURCE,
      match: { organizationId: orgId, propertyId: property?.id ?? null, assignedTo, propertyTitle: property?.title ?? null },
      name,
      email,
      phone,
      senderName: p.lead_name?.trim() || null,
      bodyText,
      noteLine,
      sentAt,
      now: sentAt,
      messageRowId: null,
      expiresAt: portalMessageExpiry(sentAt),
      createdEventNote: [`Lead creat din mesaj Properstar.`, directNote, missingNote, `${kindLine}.`, hiddenNote, bodyText]
        .filter(Boolean)
        .join(" ")
        .slice(0, 2000),
      notificationTitle: "Lead nou din Properstar",
      notificationBody: property
        ? `${name} a trimis un mesaj pentru „${property.title ?? listingLabel}” (${kind.label}).`
        : direct
          ? `${name} ți-a scris de pe pagina ta de agent Properstar.`
          : `${name} a trimis un mesaj prin Properstar.`,
      auditAction: "properstar.message_lead_created",
      auditValues: { property_id: property?.id ?? null, listing_id: p.listing_id, gateway: p.gateway ?? null, assigned_to: assignedTo, agent_id: p.agent_id ?? null, request_kind: kind.label, direct },
    });
    return finish(
      { status: 200, body: { status: "success", lead_id: outcome.leadId, duplicate: false } },
      outcome.created ? `lead created ${outcome.leadId}` : `message added to lead ${outcome.leadId}`,
    );
  } catch (e) {
    return finish(err(500, "internal_error", "Unexpected error. Retry later."), e instanceof Error ? e.message : "unexpected");
  }
}

export function collectProperstarHeaders(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of LOGGED_HEADERS) {
    const v = request.headers.get(name);
    if (v) out[name] = v.slice(0, 300);
  }
  return out;
}
