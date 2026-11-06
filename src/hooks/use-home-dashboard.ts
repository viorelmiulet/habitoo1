/**
 * Datele paginii Acasă. Totul se citește cu clientul autentificat, deci RLS
 * decide ce vede fiecare: adminul toată agenția, agentul doar ce e al lui.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const HOME_STAGES = ["new", "contacted", "viewing", "offer", "negotiation"] as const;
const ACTIVE_REQUEST_STATUSES = ["new", "active", "working"];

export type HomeMetric = { total: number; createdAt: string[] };

export type HomeProperty = {
  id: string;
  title: string;
  price: number | null;
  currency: string;
  status: string;
  agent: string | null;
  createdAt: string;
};

export type HomeLead = {
  id: string;
  name: string;
  source: string | null;
  property: string | null;
  stage: string;
  agent: string | null;
  createdAt: string;
};

export type HomeActivity = { id: string; title: string; startsAt: string };

export type HomeDashboardData = {
  metrics: { properties: HomeMetric; requests: HomeMetric; leads: HomeMetric; contacts: HomeMetric };
  stages: { stage: (typeof HOME_STAGES)[number]; count: number }[];
  latestProperties: HomeProperty[];
  latestLeads: HomeLead[];
  today: HomeActivity[];
};

export function useHomeDashboard(organizationId?: string | null) {
  return useQuery({
    queryKey: ["home-dashboard", organizationId],
    enabled: Boolean(organizationId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<HomeDashboardData> => {
      const org = organizationId as string;
      const since = new Date(Date.now() - 60 * 86_400_000).toISOString();
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + 86_400_000);

      const props = () =>
        supabase.from("properties").select("created_at", { count: "exact" })
          .eq("organization_id", org).is("deleted_at", null).eq("status", "active");
      const reqs = () =>
        supabase.from("requests").select("created_at", { count: "exact" })
          .eq("organization_id", org).in("status", ACTIVE_REQUEST_STATUSES);
      const leads = () =>
        supabase.from("leads").select("created_at", { count: "exact" })
          .eq("organization_id", org).is("deleted_at", null);
      // Totalul „Lead-uri deschise” exclude Câștigat/Pierdut; „+N azi” și luna trecută rămân pe lead-urile noi.
      const openLeads = () => leads().not("stage", "in", "(won,lost)");
      const contacts = () =>
        supabase.from("contacts").select("created_at", { count: "exact" }).eq("organization_id", org);

      const [p, r, l, c, latestP, latestL, today, profiles, ...stageRes] = await Promise.all([
        props().gte("created_at", since).limit(5000),
        reqs().gte("created_at", since).limit(5000),
        leads().gte("created_at", since).limit(5000),
        contacts().gte("created_at", since).limit(5000),
        supabase.from("properties")
          .select("id,title,status,assigned_to,created_at,price,currency,sale_price,sale_currency,rent_price,rent_currency")
          .eq("organization_id", org).is("deleted_at", null)
          .order("created_at", { ascending: false }).limit(5),
        supabase.from("leads").select("id,name,source,property_id,stage,assigned_to,created_at")
          .eq("organization_id", org).is("deleted_at", null)
          .order("created_at", { ascending: false }).limit(5),
        supabase.from("activities").select("id,title,starts_at")
          .eq("organization_id", org)
          .gte("starts_at", dayStart.toISOString()).lt("starts_at", dayEnd.toISOString())
          .order("starts_at", { ascending: true }).limit(20),
        supabase.from("profiles").select("id,full_name").eq("organization_id", org),
        ...HOME_STAGES.map((stage) =>
          supabase.from("leads").select("id", { count: "exact", head: true })
            .eq("organization_id", org).is("deleted_at", null).eq("stage", stage),
        ),
      ]);

      // Totalurile vin din numărători separate (fără limita de rânduri).
      const [pt, rt, lt, ct] = await Promise.all([
        props().limit(1), reqs().limit(1), openLeads().limit(1), contacts().limit(1),
      ]);

      const leadPropIds = [...new Set((latestL.data ?? []).map((x) => x.property_id).filter(Boolean))] as string[];
      const leadProps = leadPropIds.length
        ? await supabase.from("properties").select("id,title").in("id", leadPropIds)
        : { data: [] as { id: string; title: string }[] };
      const propTitles = new Map((leadProps.data ?? []).map((x) => [x.id, x.title]));
      const names = new Map((profiles.data ?? []).map((x) => [x.id, x.full_name as string | null]));
      const metric = (rows: { data: { created_at: string }[] | null }, total: { count: number | null }) => ({
        total: total.count ?? 0,
        createdAt: (rows.data ?? []).map((x) => x.created_at),
      });

      return {
        metrics: {
          properties: metric(p, pt),
          requests: metric(r, rt),
          leads: metric(l, lt),
          contacts: metric(c, ct),
        },
        stages: HOME_STAGES.map((stage, i) => ({ stage, count: stageRes[i].count ?? 0 })),
        latestProperties: (latestP.data ?? []).map((x) => ({
          id: x.id,
          title: x.title,
          price: x.sale_price ?? x.rent_price ?? x.price ?? null,
          currency: x.sale_currency ?? x.rent_currency ?? x.currency ?? "EUR",
          status: x.status,
          agent: x.assigned_to ? (names.get(x.assigned_to) ?? null) : null,
          createdAt: x.created_at,
        })),
        latestLeads: (latestL.data ?? []).map((x) => ({
          id: x.id,
          name: x.name,
          source: x.source,
          property: x.property_id ? (propTitles.get(x.property_id) ?? null) : null,
          stage: x.stage,
          agent: x.assigned_to ? (names.get(x.assigned_to) ?? null) : null,
          createdAt: x.created_at,
        })),
        today: (today.data ?? []).map((a) => ({ id: a.id, title: a.title, startsAt: a.starts_at })),
      };
    },
  });
}
