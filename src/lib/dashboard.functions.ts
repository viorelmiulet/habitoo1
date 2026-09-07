/**
 * Dashboardurile CRM pentru agent („ziua mea”) și pentru administratorul de
 * agenție („unde pierdem”).
 *
 * Vizibilitatea NU este reimplementată aici: fiecare interogare rulează cu
 * clientul autentificat din `requireActiveOrgAuth`, deci RLS aplică exact
 * regulile deja existente — agentul vede doar datele asignate lui, adminul
 * vede toată agenția. Interogările sunt agregate (câteva liste mărginite +
 * numărători în memorie), fără N+1 pe proprietate sau pe agent.
 */
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireActiveOrgAuth } from "@/lib/org-access";
import type { Database } from "@/integrations/supabase/types";
import { getPortalDefinition } from "@/lib/portals/registry";
import {
  computePropertyIssues,
  isBlocking,
  STALE_PROPERTY_DAYS,
  type PropertyIssue,
} from "@/lib/property-readiness";
import { planAgentLimit, planLabel } from "@/lib/plans";

type AuthContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

/** Statusuri de proprietate relevante pentru „portofoliu viu”. */
const LIVE_STATUSES = ["draft", "active", "reserved", "negotiation"] as const;
/** Etapele pipeline-ului considerate deschise. */
const OPEN_STAGES = [
  "new",
  "contacted",
  "qualified",
  "viewing",
  "offer",
  "negotiation",
  "transaction",
] as const;

const PROPERTY_LIMIT = 500;
const LEAD_LIMIT = 1000;

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function portalName(key: string): string {
  return getPortalDefinition(key)?.display_name ?? key;
}

async function loadOrg(context: AuthContext) {
  const { data: profile } = await context.supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", context.userId)
    .maybeSingle();
  const organizationId = profile?.organization_id ?? null;
  if (!organizationId) return null;
  const { data: org } = await context.supabase
    .from("organizations")
    .select("id,name,plan,collaboration_enabled,max_users")
    .eq("id", organizationId)
    .maybeSingle();
  return org ?? null;
}

// ---------------------------------------------------------------------------
// Tipuri partajate
// ---------------------------------------------------------------------------

export type DashboardTask = {
  id: string;
  title: string;
  kind: string;
  startsAt: string;
  propertyId: string | null;
  propertyTitle: string | null;
  contactName: string | null;
  contactPhone: string | null;
  leadId: string | null;
};

export type ColdLead = {
  id: string;
  name: string;
  phone: string | null;
  stage: string;
  lastTouchAt: string | null;
  createdAt: string;
};

export type StageCount = { stage: string; count: number };

export type ListingIssueRow = {
  propertyId: string;
  title: string;
  status: string;
  agentId: string | null;
  agentName: string | null;
  issues: PropertyIssue[];
};

export type ProposalRow = {
  id: string;
  clientLabel: string;
  propertyId: string;
  propertyTitle: string | null;
  agencyName: string | null;
  createdAt: string;
};

export type AgentDashboard = {
  organizationName: string;
  tasks: DashboardTask[];
  coldLeads: ColdLead[];
  pipeline: StageCount[];
  listingIssues: ListingIssueRow[];
  collaboration: {
    enabled: boolean;
    incoming: ProposalRow[];
    outgoing: ProposalRow[];
  };
  totals: { properties: number; leads: number; activities: number };
};

// ---------------------------------------------------------------------------
// Dashboard AGENT
// ---------------------------------------------------------------------------

export const getAgentDashboard = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<AgentDashboard> => {
    const ctx = context as unknown as AuthContext;
    const { supabase, userId } = ctx;
    const empty: AgentDashboard = {
      organizationName: "",
      tasks: [],
      coldLeads: [],
      pipeline: [],
      listingIssues: [],
      collaboration: { enabled: false, incoming: [], outgoing: [] },
      totals: { properties: 0, leads: 0, activities: 0 },
    };
    const org = await loadOrg(ctx);
    if (!org) return empty;

    const horizon = new Date(Date.now() + 2 * 86_400_000).toISOString();

    const [activitiesRes, leadsRes, propertiesRes] = await Promise.all([
      supabase
        .from("activities")
        .select(
          "id,title,kind,starts_at,status,done,property_id,lead_id,contact_id,properties(title),contacts(first_name,last_name,phone)",
        )
        .eq("assigned_to", userId)
        .eq("status", "planned")
        .lte("starts_at", horizon)
        .order("starts_at", { ascending: true })
        .limit(100),
      supabase
        .from("leads")
        .select("id,name,phone,stage,created_at,last_interaction_at,next_followup_at")
        .eq("assigned_to", userId)
        .order("created_at", { ascending: false })
        .limit(LEAD_LIMIT),
      supabase
        .from("properties")
        .select(
          "id,title,status,description,lat,lng,price,sale_price,rent_price,city,address,publish_status,created_at",
        )
        .eq("assigned_to", userId)
        .is("deleted_at", null)
        .in("status", [...LIVE_STATUSES])
        .order("created_at", { ascending: false })
        .limit(PROPERTY_LIMIT),
    ]);

    const activities = activitiesRes.data ?? [];
    const leads = leadsRes.data ?? [];
    const properties = propertiesRes.data ?? [];
    const propertyIds = properties.map((p) => p.id);

    // Lead-uri necontactate: nicio interacțiune și nicio activitate înregistrată.
    const cutoff48h = Date.now() - 2 * 86_400_000;
    const { data: leadActivityRows } = await supabase
      .from("activities")
      .select("lead_id")
      .eq("assigned_to", userId)
      .not("lead_id", "is", null)
      .limit(2000);
    const touchedLeads = new Set(
      (leadActivityRows ?? []).map((r) => r.lead_id).filter((v): v is string => Boolean(v)),
    );

    const openLeads = leads.filter((l) => (OPEN_STAGES as readonly string[]).includes(l.stage));
    const coldLeads: ColdLead[] = openLeads
      .filter((l) => {
        if (touchedLeads.has(l.id)) return false;
        const lastTouch = l.last_interaction_at ? new Date(l.last_interaction_at).getTime() : null;
        if (lastTouch !== null) return lastTouch < cutoff48h;
        return new Date(l.created_at).getTime() < cutoff48h;
      })
      .slice(0, 15)
      .map((l) => ({
        id: l.id,
        name: l.name,
        phone: l.phone,
        stage: l.stage,
        lastTouchAt: l.last_interaction_at,
        createdAt: l.created_at,
      }));

    const pipeline: StageCount[] = OPEN_STAGES.map((stage) => ({
      stage,
      count: leads.filter((l) => l.stage === stage).length,
    }));

    // Imagini și publicări: câte o singură interogare pentru tot lotul.
    const [imagesRes, publicationsRes] = propertyIds.length
      ? await Promise.all([
          supabase.from("property_images").select("property_id").in("property_id", propertyIds),
          supabase
            .from("portal_publications")
            .select("property_id,portal_key,status,enabled")
            .in("property_id", propertyIds),
        ])
      : [{ data: [] }, { data: [] }];

    const imageCounts = new Map<string, number>();
    for (const row of imagesRes.data ?? []) {
      imageCounts.set(row.property_id, (imageCounts.get(row.property_id) ?? 0) + 1);
    }
    const pubsByProperty = new Map<
      string,
      { portalKey: string; status: string | null; enabled: boolean }[]
    >();
    for (const row of publicationsRes.data ?? []) {
      const list = pubsByProperty.get(row.property_id) ?? [];
      list.push({
        portalKey: portalName(row.portal_key),
        status: row.status,
        enabled: row.enabled,
      });
      pubsByProperty.set(row.property_id, list);
    }

    const listingIssues: ListingIssueRow[] = properties
      .map((p) => ({
        propertyId: p.id,
        title: p.title,
        status: p.status,
        agentId: userId,
        agentName: null,
        issues: computePropertyIssues({
          description: p.description,
          imageCount: imageCounts.get(p.id) ?? 0,
          lat: p.lat,
          lng: p.lng,
          price: p.price === null ? null : Number(p.price),
          salePrice: p.sale_price === null ? null : Number(p.sale_price),
          rentPrice: p.rent_price === null ? null : Number(p.rent_price),
          city: p.city,
          address: p.address,
          publishStatus: p.publish_status,
          createdAt: p.created_at,
          publications: pubsByProperty.get(p.id) ?? [],
        }),
      }))
      .filter((row) => row.issues.length > 0)
      .sort((a, b) => Number(isBlocking(b.issues)) - Number(isBlocking(a.issues)))
      .slice(0, 20);

    // Colaborare: doar dacă agenția participă.
    let incoming: ProposalRow[] = [];
    let outgoing: ProposalRow[] = [];
    if (org.collaboration_enabled) {
      const [incomingRes, outgoingRes] = await Promise.all([
        propertyIds.length
          ? supabase
              .from("collaboration_proposals")
              .select(
                "id,client_label,property_id,created_at,properties(title),requester_organization_id",
              )
              .eq("owner_organization_id", org.id)
              .eq("status", "pending")
              .in("property_id", propertyIds)
              .order("created_at", { ascending: false })
              .limit(10)
          : Promise.resolve({ data: [] as never[] }),
        supabase
          .from("collaboration_proposals")
          .select("id,client_label,property_id,created_at,properties(title),owner_organization_id")
          .eq("requester_user_id", userId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      const orgIds = new Set<string>();
      for (const row of (incomingRes.data ?? []) as { requester_organization_id?: string }[]) {
        if (row.requester_organization_id) orgIds.add(row.requester_organization_id);
      }
      for (const row of (outgoingRes.data ?? []) as { owner_organization_id?: string }[]) {
        if (row.owner_organization_id) orgIds.add(row.owner_organization_id);
      }
      const namesById = new Map<string, string>();
      if (orgIds.size > 0) {
        const { data: orgRows } = await supabase
          .from("organizations")
          .select("id,name")
          .in("id", [...orgIds]);
        for (const row of orgRows ?? []) namesById.set(row.id, row.name);
      }

      type ProposalRaw = {
        id: string;
        client_label: string;
        property_id: string;
        created_at: string;
        properties: { title: string } | null;
      };
      incoming = ((incomingRes.data ?? []) as unknown as (ProposalRaw & {
        requester_organization_id: string;
      })[]).map((row) => ({
        id: row.id,
        clientLabel: row.client_label,
        propertyId: row.property_id,
        propertyTitle: row.properties?.title ?? null,
        agencyName: namesById.get(row.requester_organization_id) ?? null,
        createdAt: row.created_at,
      }));
      outgoing = ((outgoingRes.data ?? []) as unknown as (ProposalRaw & {
        owner_organization_id: string;
      })[]).map((row) => ({
        id: row.id,
        clientLabel: row.client_label,
        propertyId: row.property_id,
        propertyTitle: row.properties?.title ?? null,
        agencyName: namesById.get(row.owner_organization_id) ?? null,
        createdAt: row.created_at,
      }));
    }

    type ActivityRaw = {
      id: string;
      title: string;
      kind: string;
      starts_at: string;
      property_id: string | null;
      lead_id: string | null;
      properties: { title: string } | null;
      contacts: { first_name: string; last_name: string; phone: string | null } | null;
    };

    const tasks: DashboardTask[] = (activities as unknown as ActivityRaw[]).map((a) => ({
      id: a.id,
      title: a.title,
      kind: a.kind,
      startsAt: a.starts_at,
      propertyId: a.property_id,
      propertyTitle: a.properties?.title ?? null,
      contactName: a.contacts
        ? `${a.contacts.first_name} ${a.contacts.last_name}`.trim()
        : null,
      contactPhone: a.contacts?.phone ?? null,
      leadId: a.lead_id,
    }));

    return {
      organizationName: org.name,
      tasks,
      coldLeads,
      pipeline,
      listingIssues,
      collaboration: {
        enabled: Boolean(org.collaboration_enabled),
        incoming,
        outgoing,
      },
      totals: {
        properties: properties.length,
        leads: leads.length,
        activities: activities.length,
      },
    };
  });

/** Marchează o activitate ca finalizată direct din dashboard. */
export const completeDashboardTask = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: { activityId: string }) => {
    if (!data?.activityId) throw new Error("Activitate lipsă.");
    return { activityId: data.activityId };
  })
  .handler(async ({ context, data }) => {
    const { supabase } = context as unknown as AuthContext;
    const { error } = await supabase
      .from("activities")
      .update({ status: "done", done: true })
      .eq("id", data.activityId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Dashboard ADMIN AGENȚIE
// ---------------------------------------------------------------------------

export type AgentPipelineRow = {
  agentId: string;
  agentName: string;
  isActive: boolean;
  stages: Record<string, number>;
  openLeads: number;
  stalledLeads: number;
  properties: number;
  lastTouchAt: string | null;
};

export type PortalUsageRow = {
  portalKey: string;
  displayName: string;
  active: number;
  errors: number;
};

export type ConversionRow = {
  label: string;
  current: number;
  previous: number;
};

export type ManagerDashboard = {
  organizationName: string;
  stageTotals: StageCount[];
  agents: AgentPipelineRow[];
  portfolio: {
    incomplete: ListingIssueRow[];
    incompleteCount: number;
    staleCount: number;
    stale: { propertyId: string; title: string; agentName: string | null; lastActivityAt: string }[];
    unassigned: number;
    totalLive: number;
  };
  portals: PortalUsageRow[];
  conversion: ConversionRow[];
  team: { activeAgents: number; limit: number; plan: string; planKeyLabel: string };
  totals: { properties: number; leads: number };
};

export const getManagerDashboard = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<ManagerDashboard> => {
    const ctx = context as unknown as AuthContext;
    const { supabase } = ctx;
    const empty: ManagerDashboard = {
      organizationName: "",
      stageTotals: [],
      agents: [],
      portfolio: {
        incomplete: [],
        incompleteCount: 0,
        staleCount: 0,
        stale: [],
        unassigned: 0,
        totalLive: 0,
      },
      portals: [],
      conversion: [],
      team: { activeAgents: 0, limit: 0, plan: "", planKeyLabel: "" },
      totals: { properties: 0, leads: 0 },
    };
    const org = await loadOrg(ctx);
    if (!org) return empty;

    const monthAgo = daysAgoIso(30);
    const twoMonthsAgo = daysAgoIso(60);

    const [profilesRes, rolesRes, leadsRes, propertiesRes, viewingsRes, publicationsRes] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("id,full_name,is_active")
          .eq("organization_id", org.id),
        supabase.from("user_roles").select("user_id,role").eq("organization_id", org.id),
        supabase
          .from("leads")
          .select("id,stage,assigned_to,created_at,last_interaction_at,updated_at")
          .eq("organization_id", org.id)
          .order("created_at", { ascending: false })
          .limit(LEAD_LIMIT),
        supabase
          .from("properties")
          .select(
            "id,title,status,description,lat,lng,price,sale_price,rent_price,city,address,publish_status,created_at,updated_at,last_activity_at,assigned_to",
          )
          .eq("organization_id", org.id)
          .is("deleted_at", null)
          .in("status", [...LIVE_STATUSES])
          .order("created_at", { ascending: false })
          .limit(PROPERTY_LIMIT),
        supabase
          .from("activities")
          .select("id,starts_at,status")
          .eq("organization_id", org.id)
          .eq("kind", "viewing")
          .eq("status", "done")
          .gte("starts_at", twoMonthsAgo)
          .limit(2000),
        supabase
          .from("portal_publications")
          .select("property_id,portal_key,status,enabled")
          .eq("organization_id", org.id)
          .eq("enabled", true)
          .limit(5000),
      ]);

    const profiles = profilesRes.data ?? [];
    const roles = rolesRes.data ?? [];
    const leads = leadsRes.data ?? [];
    const properties = propertiesRes.data ?? [];
    const viewings = viewingsRes.data ?? [];
    const publications = publicationsRes.data ?? [];
    const propertyIds = properties.map((p) => p.id);

    const nameById = new Map(profiles.map((p) => [p.id, p.full_name] as const));

    // --- Secțiunea 1: pipeline pe agenți -----------------------------------
    const stalledCutoff = Date.now() - 7 * 86_400_000;
    const agents: AgentPipelineRow[] = profiles
      .map((profile) => {
        const agentLeads = leads.filter((l) => l.assigned_to === profile.id);
        const openLeads = agentLeads.filter((l) =>
          (OPEN_STAGES as readonly string[]).includes(l.stage),
        );
        const stages: Record<string, number> = {};
        for (const stage of OPEN_STAGES) {
          stages[stage] = agentLeads.filter((l) => l.stage === stage).length;
        }
        const touches = openLeads
          .map((l) => l.last_interaction_at ?? l.updated_at)
          .filter((v): v is string => Boolean(v))
          .sort();
        return {
          agentId: profile.id,
          agentName: profile.full_name,
          isActive: profile.is_active,
          stages,
          openLeads: openLeads.length,
          stalledLeads: openLeads.filter((l) => {
            const touch = new Date(l.last_interaction_at ?? l.updated_at ?? l.created_at).getTime();
            return touch < stalledCutoff;
          }).length,
          properties: properties.filter((p) => p.assigned_to === profile.id).length,
          lastTouchAt: touches.length ? (touches[touches.length - 1] as string) : null,
        };
      })
      .sort((a, b) => b.stalledLeads - a.stalledLeads || b.openLeads - a.openLeads);

    const stageTotals: StageCount[] = OPEN_STAGES.map((stage) => ({
      stage,
      count: leads.filter((l) => l.stage === stage).length,
    }));

    // --- Secțiunea 2: sănătatea portofoliului ------------------------------
    const [imagesRes, pubsAllRes] = propertyIds.length
      ? await Promise.all([
          supabase.from("property_images").select("property_id").in("property_id", propertyIds),
          supabase
            .from("portal_publications")
            .select("property_id,portal_key,status,enabled")
            .in("property_id", propertyIds),
        ])
      : [{ data: [] }, { data: [] }];

    const imageCounts = new Map<string, number>();
    for (const row of imagesRes.data ?? []) {
      imageCounts.set(row.property_id, (imageCounts.get(row.property_id) ?? 0) + 1);
    }
    const pubsByProperty = new Map<
      string,
      { portalKey: string; status: string | null; enabled: boolean }[]
    >();
    for (const row of pubsAllRes.data ?? []) {
      const list = pubsByProperty.get(row.property_id) ?? [];
      list.push({
        portalKey: portalName(row.portal_key),
        status: row.status,
        enabled: row.enabled,
      });
      pubsByProperty.set(row.property_id, list);
    }

    const allIssues: ListingIssueRow[] = properties
      .map((p) => ({
        propertyId: p.id,
        title: p.title,
        status: p.status,
        agentId: p.assigned_to,
        agentName: p.assigned_to ? (nameById.get(p.assigned_to) ?? null) : null,
        issues: computePropertyIssues({
          description: p.description,
          imageCount: imageCounts.get(p.id) ?? 0,
          lat: p.lat,
          lng: p.lng,
          price: p.price === null ? null : Number(p.price),
          salePrice: p.sale_price === null ? null : Number(p.sale_price),
          rentPrice: p.rent_price === null ? null : Number(p.rent_price),
          city: p.city,
          address: p.address,
          publishStatus: p.publish_status,
          createdAt: p.created_at,
          publications: pubsByProperty.get(p.id) ?? [],
        }),
      }))
      .filter((row) => isBlocking(row.issues));

    const staleCutoff = Date.now() - STALE_PROPERTY_DAYS * 86_400_000;
    const staleRows = properties
      .map((p) => ({
        propertyId: p.id,
        title: p.title,
        agentName: p.assigned_to ? (nameById.get(p.assigned_to) ?? null) : null,
        lastActivityAt: p.last_activity_at ?? p.updated_at,
      }))
      .filter((row) => new Date(row.lastActivityAt).getTime() < staleCutoff)
      .sort((a, b) => a.lastActivityAt.localeCompare(b.lastActivityAt));

    // --- Secțiunea 3: portaluri -------------------------------------------
    const portalMap = new Map<string, PortalUsageRow>();
    for (const row of publications) {
      const entry = portalMap.get(row.portal_key) ?? {
        portalKey: row.portal_key,
        displayName: portalName(row.portal_key),
        active: 0,
        errors: 0,
      };
      if (row.status === "error") entry.errors += 1;
      else entry.active += 1;
      portalMap.set(row.portal_key, entry);
    }
    const portals = [...portalMap.values()].sort((a, b) => b.errors - a.errors || b.active - a.active);

    // --- Secțiunea 4: conversie ------------------------------------------
    const inWindow = (iso: string | null, from: string, to?: string) => {
      if (!iso) return false;
      if (iso < from) return false;
      if (to && iso >= to) return false;
      return true;
    };
    const leadsCurrent = leads.filter((l) => inWindow(l.created_at, monthAgo)).length;
    const leadsPrevious = leads.filter((l) =>
      inWindow(l.created_at, twoMonthsAgo, monthAgo),
    ).length;
    const viewingsCurrent = viewings.filter((v) => inWindow(v.starts_at, monthAgo)).length;
    const viewingsPrevious = viewings.filter((v) =>
      inWindow(v.starts_at, twoMonthsAgo, monthAgo),
    ).length;
    const wonLeads = leads.filter((l) => l.stage === "won");
    const dealsCurrent = wonLeads.filter((l) => inWindow(l.updated_at, monthAgo)).length;
    const dealsPrevious = wonLeads.filter((l) =>
      inWindow(l.updated_at, twoMonthsAgo, monthAgo),
    ).length;

    // --- Secțiunea 5: echipă ---------------------------------------------
    const agentUserIds = new Set(
      roles.filter((r) => r.role === "agent" || r.role === "agency_admin").map((r) => r.user_id),
    );
    const activeAgents = profiles.filter((p) => p.is_active && agentUserIds.has(p.id)).length;

    return {
      organizationName: org.name,
      stageTotals,
      agents,
      portfolio: {
        incomplete: allIssues.slice(0, 15),
        incompleteCount: allIssues.length,
        staleCount: staleRows.length,
        stale: staleRows.slice(0, 10),
        unassigned: properties.filter((p) => !p.assigned_to).length,
        totalLive: properties.length,
      },
      portals,
      conversion: [
        { label: "Lead-uri intrate", current: leadsCurrent, previous: leadsPrevious },
        { label: "Vizionări realizate", current: viewingsCurrent, previous: viewingsPrevious },
        { label: "Tranzacții închise", current: dealsCurrent, previous: dealsPrevious },
      ],
      team: {
        activeAgents,
        limit: planAgentLimit(org.plan),
        plan: org.plan,
        planKeyLabel: planLabel(org.plan),
      },
      totals: { properties: properties.length, leads: leads.length },
    };
  });
