/**
 * Datele pentru panoul de sinteză al dashboardului (statistici, portaluri,
 * proprietăți recente, activitățile zilei).
 *
 * Totul se citește cu clientul autentificat, deci RLS aplică exact regulile
 * existente: agentul vede doar ce îi este asignat, adminul vede agenția.
 * Nu se schimbă nicio regulă de business — doar se agregă date deja expuse.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getPortalDefinition } from "@/lib/portals/registry";

const LIVE_STATUSES = ["draft", "active", "reserved", "negotiation"] as const;

export type OverviewDelta = { current: number; previous: number };

export type OverviewPortalUsage = {
  portalKey: string;
  displayName: string;
  count: number;
  errors: number;
};

export type OverviewPropertyPortal = {
  portalKey: string;
  displayName: string;
  hasError: boolean;
};

export type OverviewProperty = {
  id: string;
  title: string;
  area: string | null;
  price: number | null;
  currency: string | null;
  surface: number | null;
  rooms: number | null;
  floor: number | null;
  buildingFloors: number | null;
  badge: string | null;
  portals: OverviewPropertyPortal[];
};

export type OverviewActivity = {
  id: string;
  title: string;
  kind: string;
  startsAt: string;
  context: string | null;
};

export type DashboardOverview = {
  stats: {
    activeProperties: OverviewDelta;
    newLeads: OverviewDelta;
    viewingsToday: number;
    deals: OverviewDelta;
  };
  portals: { total: number; published: number; rows: OverviewPortalUsage[] };
  recent: OverviewProperty[];
  today: OverviewActivity[];
};

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function portalName(key: string) {
  return getPortalDefinition(key)?.display_name ?? key;
}

export function useDashboardOverview(organizationId?: string | null) {
  return useQuery({
    queryKey: ["dashboard-overview", organizationId],
    enabled: Boolean(organizationId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<DashboardOverview> => {
      const orgId = organizationId as string;
      const monthAgo = daysAgoIso(30);
      const twoMonthsAgo = daysAgoIso(60);
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + 86_400_000);

      const [propertiesRes, leadsRes, activitiesRes, publicationsRes] = await Promise.all([
        supabase
          .from("properties")
          .select(
            "id,title,city,district,status,created_at,price,currency,sale_price,sale_currency,rent_price,rent_currency,surface,usable_surface,rooms,floor,building_floors,collaboration",
          )
          .eq("organization_id", orgId)
          .is("deleted_at", null)
          .in("status", [...LIVE_STATUSES])
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("leads")
          .select("id,stage,created_at,updated_at")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase
          .from("activities")
          .select("id,title,kind,starts_at,status,properties(title),contacts(first_name,last_name)")
          .eq("organization_id", orgId)
          .gte("starts_at", dayStart.toISOString())
          .lt("starts_at", dayEnd.toISOString())
          .order("starts_at", { ascending: true })
          .limit(50),
        supabase
          .from("portal_publications")
          .select("property_id,portal_key,status,enabled")
          .eq("organization_id", orgId)
          .eq("enabled", true)
          .limit(5000),
      ]);

      const properties = propertiesRes.data ?? [];
      const leads = leadsRes.data ?? [];
      const activities = activitiesRes.data ?? [];
      const publications = publicationsRes.data ?? [];

      const activeProps = properties.filter((p) => p.status === "active");
      const inWindow = (iso: string | null, from: string, to?: string) => {
        if (!iso) return false;
        if (iso < from) return false;
        if (to && iso >= to) return false;
        return true;
      };

      const wonLeads = leads.filter((l) => l.stage === "won");

      // Portaluri: câte anunțuri sunt bifate pe fiecare portal și câte au erori.
      const usage = new Map<string, OverviewPortalUsage>();
      const byProperty = new Map<string, OverviewPropertyPortal[]>();
      const publishedIds = new Set<string>();
      for (const row of publications) {
        const entry = usage.get(row.portal_key) ?? {
          portalKey: row.portal_key,
          displayName: portalName(row.portal_key),
          count: 0,
          errors: 0,
        };
        entry.count += 1;
        if (row.status === "error") entry.errors += 1;
        usage.set(row.portal_key, entry);
        publishedIds.add(row.property_id);

        const list = byProperty.get(row.property_id) ?? [];
        list.push({
          portalKey: row.portal_key,
          displayName: portalName(row.portal_key),
          hasError: row.status === "error",
        });
        byProperty.set(row.property_id, list);
      }

      const weekAgo = daysAgoIso(7);
      const recent: OverviewProperty[] = properties.slice(0, 4).map((p) => ({
        id: p.id,
        title: p.title,
        area: p.district || p.city || null,
        price:
          p.sale_price !== null
            ? Number(p.sale_price)
            : p.rent_price !== null
              ? Number(p.rent_price)
              : p.price !== null
                ? Number(p.price)
                : null,
        currency: p.sale_currency ?? p.rent_currency ?? p.currency ?? "EUR",
        surface: p.usable_surface !== null ? Number(p.usable_surface) : p.surface !== null ? Number(p.surface) : null,
        rooms: p.rooms,
        floor: p.floor,
        buildingFloors: p.building_floors,
        badge: p.collaboration ? "Colaborare" : p.created_at >= weekAgo ? "Nou" : null,
        portals: byProperty.get(p.id) ?? [],
      }));

      type ActivityRaw = {
        id: string;
        title: string;
        kind: string;
        starts_at: string;
        properties: { title: string } | null;
        contacts: { first_name: string; last_name: string } | null;
      };
      const today: OverviewActivity[] = (activities as unknown as ActivityRaw[]).map((a) => ({
        id: a.id,
        title: a.title,
        kind: a.kind,
        startsAt: a.starts_at,
        context:
          a.properties?.title ??
          (a.contacts ? `${a.contacts.first_name} ${a.contacts.last_name}`.trim() : null),
      }));

      return {
        stats: {
          activeProperties: {
            current: activeProps.length,
            previous: activeProps.filter((p) => p.created_at < monthAgo).length,
          },
          newLeads: {
            current: leads.filter((l) => inWindow(l.created_at, monthAgo)).length,
            previous: leads.filter((l) => inWindow(l.created_at, twoMonthsAgo, monthAgo)).length,
          },
          viewingsToday: activities.filter((a) => a.kind === "viewing").length,
          deals: {
            current: wonLeads.filter((l) => inWindow(l.updated_at, monthAgo)).length,
            previous: wonLeads.filter((l) => inWindow(l.updated_at, twoMonthsAgo, monthAgo)).length,
          },
        },
        portals: {
          total: properties.length,
          published: publishedIds.size,
          rows: [...usage.values()].sort((a, b) => b.count - a.count),
        },
        recent,
        today,
      };
    },
  });
}
