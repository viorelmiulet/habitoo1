/**
 * Recomputes the Partner API state for (portal, agency) pairs and records
 * events. Eligibility is the feed's: selectedPropertyIdsForPortal (activated
 * agency + listing selected for the portal + agent phone rule) followed by the
 * same property filters and isPropertyFeedEligible used by the JSON feed.
 */
import { digest } from "./core.server";
import {
  diffAgents, diffListings, mapPartnerAgent, mapPartnerListing,
  type AgentChange, type AgentStateRow, type ListingChange, type ListingStateRow, type PartnerAgent, type PartnerListing,
} from "./schema";

export type AgencyChange = { organization_id: string; active: boolean };
export type SyncBatch = { agencies: AgencyChange[]; listings: ListingChange[]; agents: AgentChange[] };
export type SyncDeps = {
  agencyActive: (portal: string, org: string) => Promise<boolean>;
  eligibleListings: (portal: string, org: string) => Promise<PartnerListing[]>;
  activeAgents: (org: string) => Promise<PartnerAgent[]>;
  agencyState: (portal: string, org: string) => Promise<{ active: boolean } | null>;
  listingState: (portal: string, org: string) => Promise<ListingStateRow[]>;
  agentState: (portal: string, org: string) => Promise<AgentStateRow[]>;
  /** Atomic: activations first, then listings, agents, then deactivations. */
  apply: (portal: string, batch: SyncBatch) => Promise<void>;
};

export async function syncPortalOrganization(portal: string, org: string, deps: SyncDeps, hash: (v: string) => string = digest) {
  const [active, previousAgency, previousListings, previousAgents] = await Promise.all([
    deps.agencyActive(portal, org), deps.agencyState(portal, org), deps.listingState(portal, org), deps.agentState(portal, org),
  ]);
  const [listings, agents] = active
    ? await Promise.all([deps.eligibleListings(portal, org), deps.activeAgents(org)])
    : [[], []];
  const batch: SyncBatch = {
    agencies: (previousAgency?.active ?? false) !== active && (active || previousAgency) ? [{ organization_id: org, active }] : [],
    listings: diffListings(previousListings, listings, hash),
    agents: diffAgents(previousAgents, agents, hash),
  };
  if (batch.agencies.length || batch.listings.length || batch.agents.length) await deps.apply(portal, batch);
  return { listings: batch.listings.length, agents: batch.agents.length, agencies: batch.agencies.length };
}

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];
export function supabaseSyncDeps(db: Admin): SyncDeps {
  return {
    async agencyActive(portal, org) {
      const r = await db.from("portal_connections").select("organization_id,organizations!inner(archived_at)").eq("portal", portal)
        .eq("organization_id", org).eq("activated", true).is("organizations.archived_at", null).limit(1);
      if (r.error) throw r.error; return (r.data ?? []).length > 0;
    },
    async eligibleListings(portal, org) {
      const { selectedPropertyIdsForPortal } = await import("@/lib/site-feed/selection.server");
      const { readCompleteRows } = await import("@/lib/site-feed/complete-read.server");
      const { FEED_PUBLIC_STATUSES, isPropertyFeedEligible } = await import("@/lib/site-feed/mapper");
      const ids = await selectedPropertyIdsForPortal(org, portal);
      const rows: import("@/lib/site-feed/mapper").PropertyRow[] = [];
      const images: import("@/lib/site-feed/mapper").PropertyImageRow[] = [];
      for (let i = 0; i < ids.length; i += 300) {
        const chunk = ids.slice(i, i + 300);
        rows.push(...await readCompleteRows((from, to) => db.from("properties").select("*").eq("organization_id", org).in("id", chunk)
          .eq("publish_status", "published").is("deleted_at", null).in("status", [...FEED_PUBLIC_STATUSES]).order("id").range(from, to)));
        images.push(...await readCompleteRows((from, to) => db.from("property_images").select("*").eq("organization_id", org).in("property_id", chunk)
          .eq("include_in_publish", true).eq("is_confidential", false).order("id").range(from, to)));
      }
      return rows.filter(isPropertyFeedEligible).map(row => mapPartnerListing(row, images.filter(img => img.property_id === row.id)));
    },
    async activeAgents(org) {
      const r = await db.from("profiles").select("id,organization_id,full_name,email,phone,avatar_url,job_title").eq("organization_id", org).eq("is_active", true).order("id");
      if (r.error) throw r.error; return (r.data ?? []).map(p => mapPartnerAgent(p));
    },
    async agencyState(portal, org) {
      const r = await db.from("partner_api_agency_state").select("active").eq("portal", portal).eq("organization_id", org).maybeSingle();
      if (r.error) throw r.error; return r.data;
    },
    async listingState(portal, org) {
      const { readCompleteRows } = await import("@/lib/site-feed/complete-read.server");
      return readCompleteRows((from, to) => db.from("partner_api_listing_state").select("property_id,organization_id,agent_id,content_hash,visible,payload")
        .eq("portal", portal).eq("organization_id", org).order("property_id").range(from, to)) as unknown as Promise<ListingStateRow[]>;
    },
    async agentState(portal, org) {
      const r = await db.from("partner_api_agent_state").select("agent_id,organization_id,content_hash").eq("portal", portal).eq("organization_id", org);
      if (r.error) throw r.error; return r.data ?? [];
    },
    async apply(portal, batch) {
      const r = await db.rpc("partner_api_apply_sync", { _portal: portal, _agencies: batch.agencies as never, _listings: batch.listings as never, _agents: batch.agents as never });
      if (r.error) throw r.error;
    },
  };
}

/** One worker run: queue mode drains requested agencies, full mode revisits every pair. Guarded by a database lease. */
export async function runPartnerSync(mode: "queue" | "full") {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const holder = crypto.randomUUID();
  const lease = await db.rpc("partner_api_sync_lease_acquire", { _holder: holder, _seconds: 240 });
  if (lease.error) throw lease.error;
  if (lease.data !== true) return { skipped: "busy" as const };
  const deps = supabaseSyncDeps(db); let pairs = 0; let failed = 0;
  try {
    const portals = await db.from("dynamic_feed_portals").select("slug").eq("active", true).in("integration_mode", ["api", "both"]);
    if (portals.error) throw portals.error;
    let orgs: string[];
    if (mode === "queue") {
      const taken = await db.rpc("partner_api_take_sync_queue", { _limit: 200 });
      if (taken.error) throw taken.error; orgs = (taken.data ?? []) as string[];
    } else {
      const [conn, state] = await Promise.all([
        db.from("portal_connections").select("organization_id").in("portal", (portals.data ?? []).map(p => p.slug)),
        db.from("partner_api_agency_state").select("organization_id"),
      ]);
      if (conn.error) throw conn.error; if (state.error) throw state.error;
      orgs = [...new Set([...(conn.data ?? []), ...(state.data ?? [])].map(r => r.organization_id))];
    }
    const retry: string[] = [];
    for (const org of orgs) for (const p of portals.data ?? []) {
      try { await syncPortalOrganization(p.slug, org, deps); pairs++; }
      catch { failed++; if (!retry.includes(org)) retry.push(org); console.warn("partner_api_sync_pair_failed"); }
    }
    if (retry.length) { const r = await db.rpc("partner_api_enqueue_sync", { _orgs: retry }); if (r.error) console.warn("partner_api_requeue_failed"); }
    if (mode === "full") { const r = await db.rpc("partner_api_purge"); if (r.error) console.warn("partner_api_purge_failed"); }
  } finally {
    await db.rpc("partner_api_sync_lease_release", { _holder: holder });
  }
  return { pairs, failed };
}
