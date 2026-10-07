/**
 * Adaptor VDI.ro — PUSH REST cu cheia API a agenției (header `X-Api-Key`).
 *   POST /api?cat=add|mod           agenții (trimiși ÎNAINTEA anunțurilor)
 *   POST /apioferte?cat=add|mod|del anunțuri, identificate prin `idintern`
 *   POST /apioferte?cat=list        test conexiune și sincronizare stări
 * Doc: https://vdi.ro/en/documentatie-api/8o3AfHgVfwJYgEXaqETXW5jQnUGwtPCKGE5VDE75
 */
import type {
  ConnectionStatusOutcome,
  ListingOutcome,
  ListingRef,
  PortalAdapter,
  PortalContext,
  PortalFail,
  PortalResult,
} from "../adapter";
import { vdiCall, VDI_BASE_URL } from "../vdi/client.server";
import {
  mapAgentToVdi,
  mapPropertyToVdi,
  mapVdiState,
  parseVdiAgentResponse,
  parseVdiResponse,
  vdiIdIntern,
  type VdiParsed,
  type VdiProperty,
} from "../vdi/mapper";

export type VdiAgentInfo = {
  userId: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
};

export type VdiDeps = {
  loadProperty: (
    ctx: PortalContext,
    ref: ListingRef,
  ) => Promise<{ ok: true; property: VdiProperty; agent: VdiAgentInfo | null } | { ok: false; reasons: string[] }>;
  /** Maparea agent CRM → idintern VDI (creată la prima cerere, imuabilă). */
  agentLink: (organizationId: string, userId: string) => Promise<{ externalId: number; synced: boolean }>;
  markAgentSynced: (organizationId: string, userId: string, error: string | null) => Promise<void>;
  applyRemoteStates: (
    organizationId: string,
    items: { idintern: string; status: "published" | "withdrawn" }[],
  ) => Promise<number>;
  call?: typeof vdiCall;
};

function fail(code: PortalFail["code"], message: string, extra: Partial<PortalFail> = {}): PortalFail {
  return { ok: false, code, message, detail: null, httpStatus: null, ...extra };
}

function apiKeyOf(ctx: PortalContext): string | PortalFail {
  const key = ctx.portalCredential?.trim();
  return key ? key : fail("CONFIG_ERROR", "Publicarea pe VDI.ro este blocată: agenția nu are încă o cheie API VDI.ro. Cheia este introdusă de echipa Habitoo după ce VDI.ro o emite.");
}

/** Respingerea VDI → eroare finală, cu textul portalului afișat cum e. */
function rejection(parsed: Extract<VdiParsed, { ok: false }>, status: number, body: unknown): PortalFail {
  if (parsed.kind === "invalid_key")
    return fail("AUTH_ERROR", "VDI.ro: Cheie invalida — cheia e greșită sau contul nu are publicarea prin API activă.", { httpStatus: status, portalResponse: body });
  if (parsed.kind === "expired")
    return fail("AUTH_ERROR", "VDI.ro: Abonamentul a expirat — contul agenției nu mai este activ pe portal.", { httpStatus: status, portalResponse: body });
  return fail("VALIDATION_ERROR", `VDI.ro: ${parsed.text}`, { httpStatus: status, portalResponse: body });
}

export function createVdiAdapter(deps: VdiDeps): PortalAdapter {
  const call = deps.call ?? vdiCall;

  /** Trimite agentul (add sau mod) înaintea anunțului. */
  async function ensureAgent(ctx: PortalContext, apiKey: string, agent: VdiAgentInfo): Promise<number | PortalFail> {
    const link = await deps.agentLink(ctx.organizationId, agent.userId);
    const mapped = mapAgentToVdi(agent, link.externalId);
    if (!mapped.ok) return fail("VALIDATION_ERROR", mapped.reason);
    if (!ctx.allowLiveRequests) return link.externalId;
    let res = await call(apiKey, "/api", link.synced ? "mod" : "add", mapped.payload);
    if (!res.ok) return res;
    let parsed = parseVdiAgentResponse(res.body);
    // Agent marcat trimis, dar absent pe VDI: îl adăugăm din nou.
    if (!parsed.ok && link.synced && parsed.notFound) {
      res = await call(apiKey, "/api", "add", mapped.payload);
      if (!res.ok) return res;
      parsed = parseVdiAgentResponse(res.body);
    }
    if (!parsed.ok) {
      const listing = parseVdiResponse(res.body);
      await deps.markAgentSynced(ctx.organizationId, agent.userId, parsed.text);
      if (!listing.ok && listing.kind !== "rejected") return rejection(listing, res.status, res.body);
      return fail("VALIDATION_ERROR", `VDI.ro (agent): ${parsed.text}`, { httpStatus: res.status, portalResponse: res.body });
    }
    await deps.markAgentSynced(ctx.organizationId, agent.userId, null);
    return link.externalId;
  }

  async function upsert(ctx: PortalContext, ref: ListingRef, cat: "add" | "mod"): Promise<PortalResult<ListingOutcome>> {
    const apiKey = apiKeyOf(ctx);
    if (typeof apiKey !== "string") return apiKey;
    const loaded = await deps.loadProperty(ctx, ref);
    if (!loaded.ok) return fail("VALIDATION_ERROR", `Anunțul nu poate fi trimis la VDI.ro: ${loaded.reasons.join(", ")}.`);
    const property = { ...loaded.property, externalIdintern: ref.externalId ?? loaded.property.externalIdintern };

    // Validare locală completă înainte de orice apel (inclusiv emailul agentului).
    if (loaded.agent && !loaded.agent.email?.trim()) {
      return fail("VALIDATION_ERROR", "Agentul responsabil nu are email: VDI.ro creează contul agentului pe email. Completează emailul în profil.");
    }
    const preview = mapPropertyToVdi(property, null);
    if (!preview.ok) return fail("VALIDATION_ERROR", `Anunțul nu poate fi trimis la VDI.ro: ${preview.reasons.join(", ")}.`);

    let agentId: number | null = null;
    if (loaded.agent) {
      const agent = await ensureAgent(ctx, apiKey, loaded.agent);
      if (typeof agent !== "number") return agent;
      agentId = agent;
    }
    const mapped = mapPropertyToVdi(property, agentId);
    if (!mapped.ok) return fail("VALIDATION_ERROR", `Anunțul nu poate fi trimis la VDI.ro: ${mapped.reasons.join(", ")}.`);
    const externalId = String(mapped.payload.idintern);

    if (!ctx.allowLiveRequests) {
      return { ok: true, data: { externalId, live: false, detail: `vdi_dry_run cat=${cat} idintern=${externalId}`, message: "Trimiterile reale către VDI.ro sunt oprite: anunțul a fost doar validat local." } };
    }
    const res = await call(apiKey, "/apioferte", cat, mapped.payload as unknown as Record<string, unknown>);
    if (!res.ok) return res;
    const parsed = parseVdiResponse(res.body);
    if (!parsed.ok) return rejection(parsed, res.status, res.body);
    const warn = mapped.warnings.length ? ` ${mapped.warnings.join(" ")}` : "";
    return {
      ok: true,
      data: {
        externalId,
        live: true,
        detail: `vdi_${cat} idintern=${externalId} vdi_id=${parsed.vdiId ?? "-"}`,
        message: `${cat === "add" ? "Anunțul a fost publicat" : "Anunțul a fost actualizat"} pe VDI.ro.${warn}`,
        publicUrl: parsed.link,
        httpStatus: res.status,
        portalResponse: res.body,
      },
    };
  }

  return {
    id: "vdi",

    async testConnection(ctx): Promise<PortalResult<ConnectionStatusOutcome>> {
      const apiKey = apiKeyOf(ctx);
      if (typeof apiKey !== "string") return apiKey;
      if (!ctx.allowLiveRequests) return { ok: true, data: { configured: true, live: false, detail: "vdi_dry_run action=test_connection" } };
      const res = await call(apiKey, "/apioferte", "list", {}, { pe_pagina: "1", modificate_de_la: new Date().toISOString().slice(0, 10) });
      if (!res.ok) return res;
      const parsed = parseVdiResponse(res.body);
      if (!parsed.ok && parsed.kind !== "rejected") return rejection(parsed, res.status, res.body);
      if (!parsed.ok && !Array.isArray((res.body as Record<string, unknown>)?.["anunturi"])) {
        return rejection(parsed, res.status, res.body);
      }
      return { ok: true, data: { configured: true, live: true, detail: `vdi_list ok base=${VDI_BASE_URL}` } };
    },

    async getStatus(ctx): Promise<PortalResult<ConnectionStatusOutcome>> {
      const apiKey = apiKeyOf(ctx);
      if (typeof apiKey !== "string") return { ok: true, data: { configured: false, live: false, detail: apiKey.message } };
      return { ok: true, data: { configured: true, live: ctx.allowLiveRequests, detail: "Conexiune VDI.ro configurată (cheie API)." } };
    },

    publishListing(ctx, ref) {
      return upsert(ctx, ref, ref.externalId ? "mod" : "add");
    },

    updateListing(ctx, ref) {
      return upsert(ctx, ref, "mod");
    },

    async withdrawListing(ctx, ref): Promise<PortalResult<ListingOutcome>> {
      const apiKey = apiKeyOf(ctx);
      if (typeof apiKey !== "string") return apiKey;
      const idintern = vdiIdIntern(ref.externalId);
      if (idintern === null) {
        return { ok: true, data: { externalId: null, live: false, detail: "vdi_withdraw skipped", message: "Anunțul nu a fost publicat pe VDI.ro." } };
      }
      if (!ctx.allowLiveRequests) {
        return { ok: true, data: { externalId: String(idintern), live: false, detail: `vdi_dry_run cat=del idintern=${idintern}`, message: "Trimiterile reale către VDI.ro sunt oprite." } };
      }
      const res = await call(apiKey, "/apioferte", "del", { idintern });
      if (!res.ok) return res;
      const parsed = parseVdiResponse(res.body);
      if (!parsed.ok) return rejection(parsed, res.status, res.body);
      return { ok: true, data: { externalId: String(idintern), live: true, detail: `vdi_del idintern=${idintern}`, message: "Anunțul a fost retras de pe VDI.ro.", httpStatus: res.status, portalResponse: res.body } };
    },

    /** Stările de pe VDI (activ/inactiv/tranzactionat/sters) → listările Habitoo. */
    async sync(ctx): Promise<PortalResult<{ processed: number; failed: number }>> {
      const apiKey = apiKeyOf(ctx);
      if (typeof apiKey !== "string") return apiKey;
      if (!ctx.allowLiveRequests) return { ok: true, data: { processed: 0, failed: 0 } };
      const from =
        typeof ctx.settings["vdi_sync_from"] === "string"
          ? (ctx.settings["vdi_sync_from"] as string)
          : new Date(Date.now() - 7 * 86_400_000).toISOString();
      let cursor: string | null = null;
      let processed = 0;
      let failed = 0;
      for (let page = 0; page < 50; page += 1) {
        const query: Record<string, string> = { modificate_de_la: from, pe_pagina: "500" };
        if (cursor) query["cursor"] = cursor;
        const res = await call(apiKey, "/apioferte", "list", {}, query);
        if (!res.ok) return res;
        const body = (res.body ?? {}) as Record<string, unknown>;
        if (!Array.isArray(body["anunturi"])) {
          const parsed = parseVdiResponse(res.body);
          return rejection(parsed.ok ? { ok: false, text: parsed.text, kind: "rejected" } : parsed, res.status, res.body);
        }
        const items: { idintern: string; status: "published" | "withdrawn" }[] = [];
        for (const raw of body["anunturi"] as Record<string, unknown>[]) {
          const status = mapVdiState(String(raw["stare"] ?? ""));
          const idintern = raw["idintern"] != null ? String(raw["idintern"]) : "";
          if (!status || !idintern) {
            failed += 1;
            continue;
          }
          items.push({ idintern, status });
        }
        processed += await deps.applyRemoteStates(ctx.organizationId, items);
        cursor = typeof body["urmatoarea_pagina"] === "string" ? (body["urmatoarea_pagina"] as string) : null;
        if (!cursor) break;
      }
      return { ok: true, data: { processed, failed } };
    },
  };
}

/* ------------------------------- dependențe reale ------------------------------- */

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

const realDeps: VdiDeps = {
  async loadProperty(ctx, ref) {
    const db = await admin();
    const { data: row } = await db
      .from("properties")
      .select("*")
      .eq("id", ref.propertyId)
      .eq("organization_id", ctx.organizationId)
      .maybeSingle();
    if (!row) return { ok: false, reasons: ["proprietatea nu a fost găsită"] };
    const r = row as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
    const { CRM_URL } = await import("@/lib/host");
    const { data: images } = await db
      .from("property_images")
      .select("id, include_in_publish, is_confidential, position, created_at")
      .eq("organization_id", ctx.organizationId)
      .eq("property_id", ref.propertyId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    const photoUrls = ((images ?? []) as Record<string, unknown>[])
      .filter((i) => i["include_in_publish"] !== false && i["is_confidential"] !== true)
      .map((i) => `${CRM_URL.replace(/\/+$/, "")}/api/public/sites/v1/media/${String(i["id"])}`);
    const assignedTo = str(r["assigned_to"]);
    let agent: VdiAgentInfo | null = null;
    if (assignedTo) {
      const { data: p } = await db.from("profiles").select("full_name, email, phone, avatar_url").eq("id", assignedTo).maybeSingle();
      if (p) agent = { userId: assignedTo, fullName: p.full_name, email: p.email, phone: p.phone, avatarUrl: p.avatar_url };
    }
    return {
      ok: true,
      agent,
      property: {
        reference: str(r["reference"]),
        externalIdintern: null,
        propertyType: str(r["property_type"]),
        layout: str(r["layout"]),
        title: str(r["title"]),
        forSale: r["for_sale"] === true,
        forRent: r["for_rent"] === true,
        salePrice: num(r["sale_price"]),
        saleCurrency: str(r["sale_currency"]),
        rentPrice: num(r["rent_price"]),
        rentCurrency: str(r["rent_currency"]),
        price: num(r["price"]),
        currency: str(r["currency"]),
        negotiable: typeof r["negotiable"] === "boolean" ? (r["negotiable"] as boolean) : null,
        county: str(r["county"]),
        city: str(r["city"]),
        district: str(r["district"]),
        usableSurface: num(r["usable_surface"]) ?? num(r["surface"]),
        builtSurface: num(r["built_surface"]),
        landSurface: num(r["land_surface"]),
        rooms: num(r["rooms"]),
        bathrooms: num(r["bathrooms"]),
        floor: num(r["floor"]),
        floorLabel: str(r["floor_label"]),
        buildingFloors: num(r["building_floors"]),
        photoUrls,
      },
    };
  },
  async agentLink(organizationId, userId) {
    const db = await admin();
    await db
      .from("portal_agent_links")
      .upsert({ organization_id: organizationId, portal: "vdi", user_id: userId }, { onConflict: "organization_id,portal,user_id", ignoreDuplicates: true });
    const { data } = await db
      .from("portal_agent_links")
      .select("external_id, synced_at")
      .eq("organization_id", organizationId)
      .eq("portal", "vdi")
      .eq("user_id", userId)
      .single();
    if (!data) throw new Error("Maparea agentului VDI.ro nu a putut fi creată.");
    return { externalId: Number(data.external_id), synced: data.synced_at !== null };
  },
  async markAgentSynced(organizationId, userId, error) {
    const db = await admin();
    await db
      .from("portal_agent_links")
      .update(error ? { last_error: error.slice(0, 500), updated_at: new Date().toISOString() } : { synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() })
      .eq("organization_id", organizationId)
      .eq("portal", "vdi")
      .eq("user_id", userId);
  },
  async applyRemoteStates(organizationId, items) {
    const db = await admin();
    let n = 0;
    for (const item of items) {
      // Doar retragerea vine de la portal; „activ” nu republică nimic din Habitoo.
      if (item.status !== "withdrawn") continue;
      const { data } = await db
        .from("portal_listings")
        .update({ status: "withdrawn" } as never)
        .eq("organization_id", organizationId)
        .eq("portal", "vdi")
        .eq("external_id", item.idintern)
        .in("status", ["published", "updated"])
        .select("id");
      n += (data ?? []).length;
    }
    return n;
  },
};

export const vdiAdapter: PortalAdapter = createVdiAdapter(realDeps);
