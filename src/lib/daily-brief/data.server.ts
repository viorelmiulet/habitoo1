import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { stagnantLeads } from "@/lib/ai/agents/crm/insights";
import { CRM_DEFAULT_STALE_DAYS } from "@/lib/ai/agents/crm/filters";
import { nextDay, romaniaMidnightUtc } from "@/lib/owner-reports/report";
import { assembleBrief, briefDate, uniquePortalErrors, type BriefTeamRow } from "./brief";

type Db = SupabaseClient<Database>;
// Complete pagination, always caller-RLS plus explicit organization/user filters.
async function rows<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const r = await query(offset, offset + 499);
    if (r.error) throw new Error("Datele rezumatului nu au putut fi încărcate.");
    result.push(...(r.data ?? []));
    if ((r.data?.length ?? 0) < 500) return result;
  }
}

export async function loadDailyBrief(db: Db, organizationId: string, userId: string, now = new Date()) {
  const day = briefDate(now);
  const from = romaniaMidnightUtc(day), to = romaniaMidnightUtc(nextDay(day));
  const last24h = new Date(now.getTime() - 86400000).toISOString();
  const [activities, leads, properties, images, publications, jobs, matches, reports, admin] = await Promise.all([
    rows((a,b) => db.from("activities").select("id,title,kind,starts_at").eq("organization_id", organizationId).eq("assigned_to", userId).eq("done", false).neq("status", "cancelled").gte("starts_at", from).lt("starts_at", to).order("id").range(a,b)),
    rows((a,b) => db.from("leads").select("id,name,stage,created_at,last_interaction_at,next_followup_at").eq("organization_id", organizationId).eq("assigned_to", userId).is("deleted_at", null).in("stage", ["new","contacted","qualified","viewing","offer","negotiation","transaction"]).order("id").range(a,b)),
    rows((a,b) => db.from("properties").select("id,title,description,price,created_at,assigned_to").eq("organization_id", organizationId).eq("assigned_to", userId).eq("status", "active").is("deleted_at", null).is("archived_at", null).order("id").range(a,b)),
    rows((a,b) => db.from("property_images").select("property_id").eq("organization_id", organizationId).order("id").range(a,b)),
    rows((a,b) => db.from("portal_publications").select("property_id,portal_key,created_at").eq("organization_id", organizationId).eq("status", "error").eq("enabled", true).order("id").range(a,b)),
    rows((a,b) => db.from("portal_publish_jobs").select("property_id,portal_key,created_at").eq("organization_id", organizationId).eq("status", "error").order("id").range(a,b)),
    rows((a,b) => db.from("active_match_alerts").select("id,request_id,score,created_at").eq("organization_id", organizationId).eq("agent_id", userId).eq("status", "new").gte("created_at", last24h).order("id").range(a,b)),
    rows((a,b) => db.from("owner_reports").select("id,property_id,created_at").eq("organization_id", organizationId).eq("agent_id", userId).eq("status", "draft").not("pdf_path", "is", null).order("id").range(a,b)),
    db.rpc("is_org_admin"),
  ]);
  const propertyIds = new Set(properties.map(p => p.id));
  const allErrors = uniquePortalErrors([...publications, ...jobs]);
  let team: BriefTeamRow[] | null = null;
  if (admin.data === true) {
    const since = new Date(now.getTime() - 3 * 86400000).toISOString();
    const [profiles, roles, recent, portfolio] = await Promise.all([
      rows((a,b) => db.from("profiles").select("id,full_name").eq("organization_id", organizationId).eq("is_active", true).order("id").range(a,b)),
      rows((a,b) => db.from("user_roles").select("user_id").eq("role", "agent").order("id").range(a,b)),
      rows((a,b) => db.from("activities").select("assigned_to,created_by").eq("organization_id", organizationId).eq("done", true).gte("updated_at", since).order("id").range(a,b)),
      rows((a,b) => db.from("properties").select("id,assigned_to").eq("organization_id", organizationId).is("deleted_at", null).is("archived_at", null).order("id").range(a,b)),
    ]);
    const agents = new Set(roles.map(r => r.user_id));
    const active = new Set(recent.flatMap(a => [a.assigned_to, a.created_by]).filter(Boolean));
    const owners = new Map(portfolio.map(p => [p.id, p.assigned_to]));
    team = profiles.filter(p => agents.has(p.id)).map(p => ({ userId: p.id, name: p.full_name, inactive: !active.has(p.id), portalErrors: allErrors.filter(e => owners.get(e.property_id) === p.id).length }));
  }
  const stagnantIds = stagnantLeads(leads.map(l => ({ id: l.id, name: l.name, stage: l.stage, createdAt: l.created_at, lastInteractionAt: l.last_interaction_at, nextFollowupAt: l.next_followup_at, assignedTo: userId, score: null, value: null, source: null })), CRM_DEFAULT_STALE_DAYS, now).map(l => l.id);
  return assembleBrief({ now, activities, leads, properties, imagePropertyIds: images.map(i => i.property_id), portalErrors: allErrors.filter(e => propertyIds.has(e.property_id)), matches, reports, stagnantIds, team });
}