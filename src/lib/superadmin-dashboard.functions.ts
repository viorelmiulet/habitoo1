/**
 * Dashboardul Superadmin: o singură interogare agregată pentru „ce arde în
 * platformă”. Totul rulează server-side, exclusiv pentru superadmin, cu
 * numărători agregate (`head: true`) în loc de liste complete, ca pagina să
 * rămână rapidă și cu multe agenții.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AuthContext = {
  supabase: {
    rpc: (
      fn: "is_superadmin",
    ) => PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
  };
  userId: string;
};

async function assertSuperadmin(context: AuthContext) {
  const { data, error } = await context.supabase.rpc("is_superadmin");
  if (error || data !== true) {
    throw new Error("Acces refuzat: acțiunea este permisă exclusiv superadminului.");
  }
}

export type WorkQueue = {
  pendingRegistrations: number;
  pendingPortalActivations: number
  unresolvedTickets: number;
};

export type IntegrationHealthRow = {
  organizationId: string;
  organizationName: string;
  portal: string;
  status: string;
  activated: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastError: string | null;
};

export type PlatformGrowth = {
  activeAgencies: number;
  pendingAgencies: number;
  totalUsers: number;
  admins: number;
  agents: number;
  totalProperties: number;
  publishedProperties: number;
  collaborationAgencies: number;
};

export type RecentAuditEntry = {
  id: string;
  action: string;
  entity: string | null;
  createdAt: string;
  actorName: string | null;
  organizationName: string | null;
};

export type SuperadminDashboard = {
  queue: WorkQueue;
  integrations: IntegrationHealthRow[];
  growth: PlatformGrowth;
  audit: RecentAuditEntry[];
};

/** Acțiunile sensibile urmărite în secțiunea „Activitate recentă”. */
const SENSITIVE_AUDIT_ACTIONS = [
  "agency.created",
  "agency.approved",
  "agency.deleted",
  "agency.archived",
  "agency.suspended",
  "agency.status_changed",
  "organization.deleted",
  "organization.suspended",
  "registration.approved",
  "registration.rejected",
  "registration_request.approved",
  "registration_request.rejected",
  "user.deleted",
  "user.reassigned",
  "user.organization_changed",
  "user.data_reassigned",
  "portal.activated",
  "portal.activation_approved",
  "portal.activation_rejected",
  "portal_connections.upsert",
  "qa.purged",
];

export const getSuperadminDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SuperadminDashboard> => {
    await assertSuperadmin(context as AuthContext);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");

    const [
      registrations,
      activations,
      tickets,
      activeOrgs,
      pendingOrgs,
      collabOrgs,
      properties,
      roles,
      profilesCount,
      publications,
      connections,
      orgs,
      auditSensitive,
    ] = await Promise.all([
      admin
        .from("agency_registration_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      admin
        .from("portal_activation_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      admin
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress"]),
      admin
        .from("organizations")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .is("archived_at", null),
      admin
        .from("organizations")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_approval"),
      admin
        .from("organizations")
        .select("id", { count: "exact", head: true })
        .eq("collaboration_enabled", true),
      admin
        .from("properties")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),
      admin.from("user_roles").select("role"),
      admin.from("profiles").select("id", { count: "exact", head: true }),
      admin.from("portal_publications").select("property_id").eq("enabled", true),
      admin
        .from("portal_connections")
        .select(
          "organization_id,portal,status,activated,last_sync_at,last_sync_status,last_sync_error",
        ),
      admin.from("organizations").select("id,name"),
      admin
        .from("audit_logs")
        .select("id,action,entity,created_at,actor_id,organization_id")
        .in("action", SENSITIVE_AUDIT_ACTIONS)
        .order("created_at", { ascending: false })
        .limit(15),
    ]);

    const orgName = new Map((orgs.data ?? []).map((o) => [o.id, o.name]));

    // Fallback: dacă nicio acțiune sensibilă nu este înregistrată încă, arătăm
    // ultimele evenimente de audit, ca secțiunea să nu apară gol fără motiv.
    let auditRows = auditSensitive.data ?? [];
    if (auditRows.length === 0) {
      const { data } = await admin
        .from("audit_logs")
        .select("id,action,entity,created_at,actor_id,organization_id")
        .order("created_at", { ascending: false })
        .limit(15);
      auditRows = data ?? [];
    }

    const actorIds = [...new Set(auditRows.map((a) => a.actor_id).filter(Boolean))] as string[];
    const actorName = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data } = await admin.from("profiles").select("id,full_name").in("id", actorIds);
      for (const p of data ?? []) actorName.set(p.id, p.full_name);
    }

    const roleList = (roles.data ?? []).map((r) => r.role as string);
    const publishedProperties = new Set((publications.data ?? []).map((p) => p.property_id)).size;

    const statusRank: Record<string, number> = { error: 0, not_configured: 1, disconnected: 2 };
    const integrations: IntegrationHealthRow[] = (connections.data ?? [])
      .map((c) => ({
        organizationId: c.organization_id,
        organizationName: orgName.get(c.organization_id) ?? "—",
        portal: c.portal,
        status: c.status,
        activated: c.activated,
        lastSyncAt: c.last_sync_at,
        lastSyncStatus: c.last_sync_status,
        lastError: c.last_sync_error,
      }))
      .sort((a, b) => {
        const aErr = a.lastError ? -1 : (statusRank[a.status] ?? 5);
        const bErr = b.lastError ? -1 : (statusRank[b.status] ?? 5);
        if (aErr !== bErr) return aErr - bErr;
        return a.organizationName.localeCompare(b.organizationName, "ro");
      });

    return {
      queue: {
        pendingRegistrations: registrations.count ?? 0,
        pendingPortalActivations: activations.count ?? 0,
        unresolvedTickets: tickets.count ?? 0,
      },
      integrations,
      growth: {
        activeAgencies: activeOrgs.count ?? 0,
        pendingAgencies: pendingOrgs.count ?? 0,
        totalUsers: profilesCount.count ?? 0,
        admins: roleList.filter((r) => r === "agency_admin").length,
        agents: roleList.filter((r) => r === "agent").length,
        totalProperties: properties.count ?? 0,
        publishedProperties,
        collaborationAgencies: collabOrgs.count ?? 0,
      },
      audit: auditRows.map((a) => ({
        id: a.id,
        action: a.action,
        entity: a.entity,
        createdAt: a.created_at,
        actorName: a.actor_id ? (actorName.get(a.actor_id) ?? null) : null,
        organizationName: a.organization_id ? (orgName.get(a.organization_id) ?? null) : null,
      })),
    };
  });
