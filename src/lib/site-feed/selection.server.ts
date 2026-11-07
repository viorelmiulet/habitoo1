import { feedRequiresAgentPhone, idsWithAgentPhone } from "@/lib/portals/listing-contact";
import { readCompleteRows } from "./complete-read.server";

/** Shared by the JSON list/detail and the XML inventory. */
export async function selectedPropertyIdsForPortal(organizationId: string, portal: string): Promise<string[]> {
  const {supabaseAdmin} = await import("@/integrations/supabase/client.server");
  const pubs = await readCompleteRows((from, to) => supabaseAdmin.from("portal_publications").select("property_id")
    .eq("organization_id", organizationId).eq("portal_key", portal).eq("enabled", true).order("property_id").range(from, to));
  const ids = [...new Set(pubs.map(row => row.property_id))];
  const { resolveIndexPortal } = await import("@/lib/dynamic-feed-portals.server");
  const dynamic = !feedRequiresAgentPhone(portal) && (await resolveIndexPortal(portal)) !== null;
  if ((!feedRequiresAgentPhone(portal) && !dynamic) || !ids.length) return ids;
  const props: {id: string; assigned_to: string | null}[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    props.push(...await readCompleteRows((from, to) => supabaseAdmin.from("properties").select("id, assigned_to")
      .eq("organization_id", organizationId).in("id", ids.slice(i, i + 300)).order("id").range(from, to)));
  }
  const agentIds = [...new Set(props.map(p => p.assigned_to).filter((id): id is string => Boolean(id)))];
  const agents: {id: string; full_name: string | null; email: string | null; phone: string | null}[] = [];
  for (let i = 0; i < agentIds.length; i += 300) {
    agents.push(...await readCompleteRows((from, to) => supabaseAdmin.from("profiles").select("id, full_name, email, phone")
      .eq("organization_id", organizationId).in("id", agentIds.slice(i, i + 300)).order("id").range(from, to)));
  }
  return idsWithAgentPhone(props, agents);
}