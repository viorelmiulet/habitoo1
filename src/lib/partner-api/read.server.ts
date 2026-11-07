/**
 * Partner API v1 read endpoints. All data comes from the per-portal state
 * produced by the sync job, scoped to the key's environment.
 */
import { z } from "zod";
import { apiError, type Environment, type PartnerContext } from "./core.server";
import { TAXONOMIES, decodeCursor, encodeCursor, mapPartnerAgency, type OrgRow, type PartnerAgent, type PartnerListing } from "./schema";

export type StoredListing = { property_id: string; organization_id: string; visible: boolean; payload: PartnerListing; updated_at: string; withdrawn_at: string | null };
export type StoredEvent = { seq: number; type: string; entity_type: string; entity_id: string; organization_id: string; occurred_at: string };
export type EnvScope = { known: string[]; active: Map<string, string | null> };
export type ListingQuery = { orgIds: string[]; status: "active" | "withdrawn" | "all"; updatedSince: string | null; after: { u: string; i: string } | null; limit: number };
export type PartnerReadStore = {
  scope: (portal: string, environment: Environment) => Promise<EnvScope>;
  organizations: (ids: string[]) => Promise<OrgRow[]>;
  listings: (portal: string, q: ListingQuery) => Promise<StoredListing[]>;
  listing: (portal: string, id: string) => Promise<StoredListing | null>;
  agents: (portal: string, orgIds: string[]) => Promise<PartnerAgent[]>;
  events: (portal: string, orgIds: string[], afterSeq: number, limit: number) => Promise<StoredEvent[]>;
  maxSeq: (portal: string) => Promise<number>;
};

const uuid = z.string().uuid();
const WITHDRAWN_RETENTION_MS = 30 * 86400000;
const present = (l: StoredListing, now = Date.now()) => l.visible || (l.withdrawn_at !== null && Date.parse(l.withdrawn_at) > now - WITHDRAWN_RETENTION_MS);
export function listingResponse(l: StoredListing): PartnerListing {
  return { ...l.payload, status: l.visible ? l.payload.status : "withdrawn", updated_at: l.updated_at, withdrawn_at: l.visible ? null : l.withdrawn_at };
}
const invalid = (ctx: PartnerContext, field: string, message: string) => apiError(400, "INVALID_PARAMETER", message, ctx.requestId, [{ field }]);
const notFound = (ctx: PartnerContext, what: string) => apiError(404, "NOT_FOUND", `${what} nu există pentru acest portal.`, ctx.requestId);
const json = (body: unknown) => Response.json(body);

export async function handleAgencies(ctx: PartnerContext, store: PartnerReadStore, id?: string) {
  const scope = await store.scope(ctx.portal.slug, ctx.identity.environment);
  if (id !== undefined) {
    if (!uuid.safeParse(id).success || !scope.active.has(id)) return notFound(ctx, "Agenția");
    const [org] = await store.organizations([id]); if (!org) return notFound(ctx, "Agenția");
    return json(mapPartnerAgency(org, scope.active.get(id) ?? null));
  }
  const ids = [...scope.active.keys()];
  const orgs = ids.length ? await store.organizations(ids) : [];
  return json({ data: orgs.sort((a, b) => a.id.localeCompare(b.id)).map(o => mapPartnerAgency(o, scope.active.get(o.id) ?? null)) });
}

const listingQuery = z.object({
  agency_id: uuid.optional(), updated_since: z.string().datetime({ offset: true }).optional(),
  status: z.enum(["active", "withdrawn", "all"]).default("all"), limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().max(400).optional(),
});
export async function handleListings(ctx: PartnerContext, store: PartnerReadStore, url: URL) {
  const parsed = listingQuery.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return invalid(ctx, String(parsed.error.issues[0]?.path[0] ?? "query"), "Parametri invalizi: agency_id (UUID), updated_since (ISO 8601), status (active|withdrawn|all), limit (1–100).");
  const q = parsed.data;
  const filterKey = [q.agency_id ?? "", q.updated_since ?? "", q.status].join("|");
  let after: { u: string; i: string } | null = null;
  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    if (!c || typeof c.u !== "string" || typeof c.i !== "string" || c.f !== filterKey) return invalid(ctx, "cursor", "Cursor invalid sau folosit cu alte filtre.");
    after = { u: c.u, i: c.i };
  }
  const scope = await store.scope(ctx.portal.slug, ctx.identity.environment);
  const orgIds = q.agency_id ? scope.known.filter(o => o === q.agency_id) : scope.known;
  if (!orgIds.length) return json({ data: [], next_cursor: null });
  const rows = (await store.listings(ctx.portal.slug, { orgIds, status: q.status, updatedSince: q.updated_since ?? null, after, limit: q.limit + 1 })).filter(r => present(r));
  const page = rows.slice(0, q.limit); const last = page[page.length - 1];
  return json({ data: page.map(listingResponse), next_cursor: rows.length > q.limit && last ? encodeCursor({ u: last.updated_at, i: last.property_id, f: filterKey }) : null });
}
export async function handleListing(ctx: PartnerContext, store: PartnerReadStore, id: string) {
  if (!uuid.safeParse(id).success) return notFound(ctx, "Anunțul");
  const [scope, row] = await Promise.all([store.scope(ctx.portal.slug, ctx.identity.environment), store.listing(ctx.portal.slug, id)]);
  if (!row || !scope.known.includes(row.organization_id) || !present(row)) return notFound(ctx, "Anunțul");
  return json(listingResponse(row));
}

export async function handleAgents(ctx: PartnerContext, store: PartnerReadStore, url: URL, id?: string) {
  const scope = await store.scope(ctx.portal.slug, ctx.identity.environment);
  const active = [...scope.active.keys()];
  if (id !== undefined) {
    if (!uuid.safeParse(id).success) return notFound(ctx, "Agentul");
    const agent = active.length ? (await store.agents(ctx.portal.slug, active)).find(a => a.id === id) : undefined;
    return agent ? json(agent) : notFound(ctx, "Agentul");
  }
  const agency = url.searchParams.get("agency_id");
  if (agency !== null && !uuid.safeParse(agency).success) return invalid(ctx, "agency_id", "agency_id trebuie să fie UUID.");
  const orgIds = agency ? active.filter(o => o === agency) : active;
  const agents = orgIds.length ? await store.agents(ctx.portal.slug, orgIds) : [];
  return json({ data: agents.sort((a, b) => a.id.localeCompare(b.id)) });
}

export function handleTaxonomies() { return json(TAXONOMIES); }

const changesQuery = z.object({ cursor: z.string().max(400).optional(), limit: z.coerce.number().int().min(1).max(500).default(100) });
export async function handleChanges(ctx: PartnerContext, store: PartnerReadStore, url: URL) {
  const parsed = changesQuery.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return invalid(ctx, String(parsed.error.issues[0]?.path[0] ?? "query"), "Parametri invalizi: cursor, limit (1–500).");
  if (!parsed.data.cursor) return json({ data: [], next_cursor: encodeCursor({ s: await store.maxSeq(ctx.portal.slug) }), has_more: false });
  const c = decodeCursor(parsed.data.cursor);
  if (!c || typeof c.s !== "number" || !Number.isSafeInteger(c.s) || c.s < 0) return invalid(ctx, "cursor", "Cursor invalid.");
  const scope = await store.scope(ctx.portal.slug, ctx.identity.environment);
  if (!scope.known.length) return json({ data: [], next_cursor: parsed.data.cursor, has_more: false });
  const rows = await store.events(ctx.portal.slug, scope.known, c.s, parsed.data.limit + 1);
  const page = rows.slice(0, parsed.data.limit); const last = page[page.length - 1];
  return json({
    data: page.map(e => ({ seq: e.seq, type: e.type, entity_type: e.entity_type, entity_id: e.entity_id, agency_id: e.organization_id, occurred_at: e.occurred_at })),
    next_cursor: encodeCursor({ s: last ? last.seq : c.s }), has_more: rows.length > parsed.data.limit,
  });
}

/** Supabase-backed store; service role, called only after servePartner authenticated the key. */
export async function supabaseReadStore(): Promise<PartnerReadStore> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  return {
    async scope(portal, environment) {
      const [state, test] = await Promise.all([
        db.from("partner_api_agency_state").select("organization_id,active,activated_at").eq("portal", portal),
        db.from("partner_api_test_agencies").select("organization_id"),
      ]);
      if (state.error) throw state.error; if (test.error) throw test.error;
      const testIds = new Set((test.data ?? []).map(r => r.organization_id));
      let rows = state.data ?? [];
      if (environment === "test") rows = rows.filter(r => testIds.has(r.organization_id));
      else {
        rows = rows.filter(r => !testIds.has(r.organization_id));
        if (rows.length) {
          const demo = await db.from("organizations").select("id").in("id", rows.map(r => r.organization_id)).eq("is_demo", true);
          if (demo.error) throw demo.error; const d = new Set((demo.data ?? []).map(r => r.id)); rows = rows.filter(r => !d.has(r.organization_id));
        }
      }
      return { known: rows.map(r => r.organization_id), active: new Map(rows.filter(r => r.active).map(r => [r.organization_id, r.activated_at])) };
    },
    async organizations(ids) {
      const r = await db.from("organizations").select("id,name,legal_name,cui,email,phone,material_website,logo_path,logo_url,registered_address,city,county").in("id", ids).is("archived_at", null);
      if (r.error) throw r.error; return r.data ?? [];
    },
    async listings(portal, q) {
      let query = db.from("partner_api_listing_state").select("property_id,organization_id,visible,payload,updated_at,withdrawn_at").eq("portal", portal).in("organization_id", q.orgIds);
      if (q.status === "active") query = query.eq("visible", true);
      if (q.status === "withdrawn") query = query.eq("visible", false);
      if (q.updatedSince) query = query.gt("updated_at", q.updatedSince);
      if (q.after) query = query.or(`updated_at.gt.${q.after.u},and(updated_at.eq.${q.after.u},property_id.gt.${q.after.i})`);
      const r = await query.order("updated_at").order("property_id").limit(q.limit);
      if (r.error) throw r.error; return (r.data ?? []) as unknown as StoredListing[];
    },
    async listing(portal, id) {
      const r = await db.from("partner_api_listing_state").select("property_id,organization_id,visible,payload,updated_at,withdrawn_at").eq("portal", portal).eq("property_id", id).maybeSingle();
      if (r.error) throw r.error; return r.data as unknown as StoredListing | null;
    },
    async agents(portal, orgIds) {
      const r = await db.from("partner_api_agent_state").select("payload").eq("portal", portal).in("organization_id", orgIds).order("agent_id");
      if (r.error) throw r.error; return (r.data ?? []).map(x => x.payload as unknown as PartnerAgent);
    },
    async events(portal, orgIds, afterSeq, limit) {
      const r = await db.from("partner_api_events").select("seq,type,entity_type,entity_id,organization_id,occurred_at").eq("portal", portal).in("organization_id", orgIds).gt("seq", afterSeq).order("seq").limit(limit);
      if (r.error) throw r.error; return (r.data ?? []) as StoredEvent[];
    },
    async maxSeq(portal) {
      const r = await db.from("partner_api_events").select("seq").eq("portal", portal).order("seq", { ascending: false }).limit(1);
      if (r.error) throw r.error; return r.data?.[0]?.seq ?? 0;
    },
  };
}
