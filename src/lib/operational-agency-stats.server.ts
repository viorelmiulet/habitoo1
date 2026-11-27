import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AgencyStatsRow } from "@/lib/superadmin-stats.functions";
import { readCompleteRows } from "@/lib/site-feed/complete-read.server";

type Org = Database["public"]["Tables"]["organizations"]["Row"];

/** The legacy stats RPC excludes grace-period agencies; recover their actual aggregates by reads only. */
export async function readGraceAgencyStats(db: SupabaseClient<Database>, org: Org, lastActivity: string | null, now: number): Promise<AgencyStatsRow> {
  const since = new Date(now - 30 * 86400000).toISOString();
  const month = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit" }).format(new Date(now)) + "-01";
  const count = async (query: PromiseLike<{ count: number | null; error: { message: string } | null }>) => {
    const result = await query;
    if (result.error) throw new Error(result.error.message);
    return result.count ?? 0;
  };
  const [properties, publications, users, leadsNew, leadsOpen, requests, contacts, portals, catchTokens, catchImports, credits] = await Promise.all([
    readCompleteRows((from, to) => db.from("properties").select("id,status,created_at").eq("organization_id", org.id).is("deleted_at", null).order("id").range(from, to)),
    readCompleteRows((from, to) => db.from("portal_publications").select("id,property_id,status").eq("organization_id", org.id).eq("enabled", true).order("id").range(from, to)),
    count(db.from("profiles").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("is_active", true)),
    count(db.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", org.id).is("deleted_at", null).gt("created_at", since)),
    count(db.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", org.id).is("deleted_at", null).not("stage", "in", "(won,lost)")),
    count(db.from("requests").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("status", "active")),
    count(db.from("contacts").select("id", { count: "exact", head: true }).eq("organization_id", org.id)),
    readCompleteRows((from, to) => db.from("portal_integrations").select("id,portal_key").eq("organization_id", org.id).eq("enabled", true).order("portal_key").order("id").range(from, to)),
    count(db.from("extension_tokens").select("id", { count: "exact", head: true }).eq("organization_id", org.id).is("revoked_at", null)),
    count(db.from("property_capture_sources").select("id", { count: "exact", head: true }).eq("organization_id", org.id).gt("created_at", since)),
    readCompleteRows((from, to) => db.from("ai_credit_ledger").select("id,credits").eq("organization_id", org.id).eq("month_start", month).neq("status", "refunded").order("id").range(from, to)),
  ]);
  const liveIds = new Set(properties.map(p => p.id));
  const published = new Set(publications.filter(p => p.status === "synced").map(p => p.property_id));
  const errors = new Set(publications.filter(p => p.status === "error" && liveIds.has(p.property_id)).map(p => p.property_id));
  const byStatus: Record<string, number> = {};
  for (const p of properties) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
  return {
    id: org.id, name: org.name, plan: org.plan, status: org.status, is_trial: org.is_trial, is_demo: org.is_demo,
    max_users: org.max_users, subscription_expires_at: org.subscription_expires_at, created_at: org.created_at, ai_enabled: org.ai_enabled,
    listings_active: properties.filter(p => p.status === "active").length, listings_total: properties.length, listings_by_status: byStatus,
    listings_published: properties.filter(p => p.status === "active" && published.has(p.id)).length,
    listings_with_errors: errors.size, listings_added_30d: properties.filter(p => p.created_at > since).length,
    users_active: users, leads_new_30d: leadsNew, leads_open: leadsOpen, requests_active: requests, contacts,
    portals: portals.map(p => p.portal_key), last_activity_at: lastActivity, catch_enabled: catchTokens > 0,
    catch_imports_30d: catchImports, ai_credits_month: credits.reduce((sum, row) => sum + row.credits, 0),
  };
}
