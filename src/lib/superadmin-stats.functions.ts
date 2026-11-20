// Statistici per agenție/agent, exclusiv superadmin. Agregatele vin gata calculate din RPC-uri
// SECURITY DEFINER care verifică is_superadmin(); aici verificăm încă o dată înainte de apel.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { averageCompletenessByAgent } from "@/lib/superadmin-stats";
import type { AgencyInactiveReason } from "@/lib/agency-stats-scope";

export type InactiveAgencyRow = {
  id: string; name: string; status: string; plan: string | null; is_demo: boolean | null;
  subscription_expires_at: string | null; inactive_reason: AgencyInactiveReason;
  users_total: number; listings_total: number; last_activity_at: string | null;
};

export type AgencyStatsRow = {
  id: string; name: string; plan: string | null; status: string; is_trial: boolean | null; is_demo: boolean | null;
  max_users: number | null; subscription_expires_at: string | null; created_at: string; ai_enabled: boolean | null;
  listings_active: number; listings_total: number; listings_by_status: Record<string, number>;
  listings_published: number; listings_with_errors: number; listings_added_30d: number; users_active: number;
  leads_new_30d: number; leads_open: number; requests_active: number; contacts: number; portals: string[];
  last_activity_at: string | null; catch_enabled: boolean; catch_imports_30d: number; ai_credits_month: number;
};
export type PlatformTotals = Record<
  "agencies_active" | "agencies_trial" | "agencies_suspended" | "agencies_new_30d" | "users_active" | "listings_active" | "listings_published" | "leads_30d",
  number
>;
export type AgentStatsRow = {
  id: string | null; full_name: string; is_active: boolean | null; roles: string | null;
  listings_active: number; listings_total: number; listings_added_30d: number; listings_published: number;
  leads_open: number; activities_7d: number | null; last_sign_in_at: string | null; avg_completeness: number | null;
};

type Rpc = { rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

export async function assertSuperadminCaller(supabase: Rpc) {
  const { data, error } = await supabase.rpc("is_superadmin");
  if (error || data !== true) throw new Error("Acces refuzat: statisticile sunt disponibile doar superadminului.");
}

export const getAgencyStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ includeDemo: z.boolean().default(false) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Rpc;
    await assertSuperadminCaller(sb);
    const [a, t, inactive] = await Promise.all([
      sb.rpc("superadmin_agency_stats", { _include_demo: data.includeDemo }),
      sb.rpc("superadmin_platform_totals", { _include_demo: data.includeDemo }),
      sb.rpc("superadmin_inactive_agencies", { _include_demo: data.includeDemo }),
    ]);
    if (a.error) throw new Error(a.error.message);
    if (t.error) throw new Error(t.error.message);
    if (inactive.error) throw new Error(inactive.error.message);
    return { agencies: (a.data ?? []) as AgencyStatsRow[], totals: t.data as PlatformTotals,
      inactiveAgencies: (inactive.data ?? []) as InactiveAgencyRow[] };
  });

export const getAgencyAgentStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ organizationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as Rpc;
    await assertSuperadminCaller(sb);
    const { data: rows, error } = await sb.rpc("superadmin_agency_agent_stats", { _org: data.organizationId });
    if (error) throw new Error(error.message);
    if (!Array.isArray(rows) || rows.length === 0) return [] as AgentStatsRow[];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const props: Record<string, unknown>[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: page, error: e } = await supabaseAdmin.from("properties").select("*")
        .eq("organization_id", data.organizationId).eq("status", "active").is("deleted_at", null).range(from, from + 999);
      if (e) throw new Error(e.message);
      props.push(...((page ?? []) as Record<string, unknown>[]));
      if (!page || page.length < 1000) break;
    }
    const ids = props.map((p) => String(p.id));
    const images: { property_id: string }[] = [];
    const contracts: { property_id: string | null }[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const [im, co] = await Promise.all([
        supabaseAdmin.from("property_images").select("property_id").in("property_id", chunk),
        supabaseAdmin.from("contracts").select("property_id").in("property_id", chunk),
      ]);
      images.push(...((im.data ?? []) as { property_id: string }[]));
      contracts.push(...((co.data ?? []) as { property_id: string | null }[]));
    }
    const avg = averageCompletenessByAgent(props, images, contracts);
    return ((rows ?? []) as AgentStatsRow[]).map((r) => ({ ...r, avg_completeness: avg.get(r.id) ?? null }));
  });
