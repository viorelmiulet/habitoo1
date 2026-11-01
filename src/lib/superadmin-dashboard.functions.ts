/**
 * Dashboardul Superadmin: o singură interogare agregată pentru „ce arde în
 * platformă”. Totul rulează server-side, exclusiv pentru superadmin, cu
 * numărători agregate (`head: true`) în loc de liste complete, ca pagina să
 * rămână rapidă și cu multe agenții.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  classifyExpiry,
  groupBlockedPublishing,
  termLabel,
  type SubscriptionAlert,
  type SuperadminTodo,
} from "@/lib/superadmin-todo";
import { AGENCY_ROW_LIMIT, buildAgencyRowsFrom, type AgencyRow } from "@/lib/superadmin-agencies";
import { WEEK_PORTAL_OPERATIONS, isActiveLogin, type SuperadminWeek } from "@/lib/superadmin-week";

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
  pendingPortalActivations: number;
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
  week: SuperadminWeek;
  agencies: AgencyRow[];
  audit: RecentAuditEntry[];
  todo: SuperadminTodo;
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

    // O eroare de coloană sau de permisiune nu trebuie să arate ca „nicio
    // conexiune”: o ridicăm ca eroare vizibilă în interfață.
    const failures = (
      [
        ["cereri de înscriere", registrations],
        ["cereri de activare portal", activations],
        ["tichete de suport", tickets],
        ["conexiuni portal", connections],
        ["organizații", orgs],
        ["jurnal audit", auditSensitive],
      ] as [string, { error: { message: string } | null }][]
    )
      .filter(([, r]) => r.error)
      .map(([label, r]) => `${label}: ${r.error?.message}`);

    if (failures.length > 0) {
      console.error("[superadmin-dashboard] query failures", failures);
      throw new Error(`Interogările dashboardului au eșuat — ${failures.join(" | ")}`);
    }

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

    const lastLogin = await loadLastLogins(admin);
    const [todo, week, agencies] = await Promise.all([
      buildTodo(admin),
      buildWeek(admin, lastLogin),
      buildAgencyRows(admin, lastLogin),
    ]);

    return {
      todo,
      queue: {
        pendingRegistrations: registrations.count ?? 0,
        pendingPortalActivations: activations.count ?? 0,
        unresolvedTickets: tickets.count ?? 0,
      },
      integrations,
      week,
      agencies,
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

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

/** Blocul „De rezolvat”: numărători agregate, agențiile demo excluse peste tot. */
async function buildTodo(admin: Admin): Promise<SuperadminTodo> {
  const { data: orgRows, error: orgErr } = await admin
    .from("organizations")
    .select("id,name,is_demo,status,archived_at,is_trial,subscription_term,subscription_expires_at");
  if (orgErr) throw new Error(`Interogările dashboardului au eșuat — organizații: ${orgErr.message}`);
  const orgs = orgRows ?? [];
  const demoIds = orgs.filter((o) => o.is_demo).map((o) => o.id);
  const nameOf = new Map(orgs.map((o) => [o.id, o.name]));
  // Rândurile fără agenție (ex. cereri de înscriere noi) rămân incluse.
  const notDemo = <T extends { or: (f: string) => T }>(q: T): T =>
    demoIds.length ? q.or(`organization_id.is.null,organization_id.not.in.(${demoIds.join(",")})`) : q;

  const [reg, subs, act, tick, conns, pubs] = await Promise.all([
    notDemo(admin.from("agency_registration_requests").select("id", { count: "exact", head: true }).eq("status", "pending")),
    notDemo(admin.from("subscription_requests").select("id", { count: "exact", head: true }).eq("status", "pending")),
    notDemo(admin.from("portal_activation_requests").select("id", { count: "exact", head: true }).eq("status", "pending")),
    notDemo(admin.from("support_tickets").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"])),
    notDemo(
      admin
        .from("portal_connections")
        .select("id", { count: "exact", head: true })
        .eq("activated", true)
        .or("status.eq.error,last_sync_status.eq.error"),
    ),
    notDemo(
      admin
        .from("portal_publications")
        .select("organization_id,last_error")
        .eq("enabled", true)
        .eq("status", "error")
        .neq("portal_key", "facebook_catalog"),
    ),
  ]);
  const failed = (
    [["cereri de înscriere", reg], ["cereri de abonament", subs], ["activări portal", act], ["tichete", tick], ["conexiuni", conns], ["publicări", pubs]] as [string, { error: { message: string } | null }][]
  ).filter(([, r]) => r.error);
  if (failed.length) {
    throw new Error(`Interogările dashboardului au eșuat — ${failed.map(([l, r]) => `${l}: ${r.error?.message}`).join(" | ")}`);
  }

  const now = Date.now();
  const alerts: (SubscriptionAlert & { kind: "expiring" | "expired" })[] = [];
  for (const o of orgs) {
    if (o.is_demo || o.status !== "active" || o.archived_at) continue;
    const c = classifyExpiry(o.subscription_expires_at, now);
    if (!c) continue;
    alerts.push({
      kind: c.kind,
      organizationId: o.id,
      organizationName: o.name,
      termLabel: termLabel(o.subscription_term, o.is_trial ?? false),
      expiresAt: o.subscription_expires_at as string,
      daysLeft: c.daysLeft,
      expired: c.kind === "expired",
      activeProperties: 0,
      lastLoginAt: null,
    });
  }

  await Promise.all(
    alerts.map(async (a) => {
      const [{ count }, { data: members }] = await Promise.all([
        admin
          .from("properties")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", a.organizationId)
          .eq("status", "active")
          .is("deleted_at", null),
        admin.from("profiles").select("id").eq("organization_id", a.organizationId),
      ]);
      a.activeProperties = count ?? 0;
      const logins = await Promise.all(
        (members ?? []).map(async (m) => (await admin.auth.admin.getUserById(m.id)).data.user?.last_sign_in_at ?? null),
      );
      a.lastLoginAt = logins.filter((x): x is string => !!x).sort().at(-1) ?? null;
    }),
  );
  const strip = ({ kind: _k, ...rest }: (typeof alerts)[number]): SubscriptionAlert => rest;

  return {
    counts: {
      pendingRegistrations: reg.count ?? 0,
      pendingSubscriptionRequests: subs.count ?? 0,
      pendingPortalActivations: act.count ?? 0,
      openTickets: tick.count ?? 0,
      failingConnections: conns.count ?? 0,
    },
    expiring: alerts.filter((a) => a.kind === "expiring").sort((x, y) => x.daysLeft - y.daysLeft).map(strip),
    expired: alerts.filter((a) => a.kind === "expired").sort((x, y) => x.daysLeft - y.daysLeft).map(strip),
    blocked: groupBlockedPublishing(
      (pubs.data ?? []) as { organization_id: string; last_error: string | null }[],
      (id) => nameOf.get(id) ?? "—",
    ),
  };
}

/** Blocul „Ultimele 7 zile”: numărători agregate, agențiile demo excluse. */
async function buildWeek(admin: Admin, lastLogin: Map<string, string | null>): Promise<SuperadminWeek> {
  const now = Date.now();
  const since = new Date(now - 7 * 86_400_000).toISOString();
  const prev = new Date(now - 14 * 86_400_000).toISOString();
  const { data: orgRows, error } = await admin.from("organizations").select("id,is_demo,status,archived_at,is_trial");
  if (error) throw new Error(`Interogările dashboardului au eșuat — organizații: ${error.message}`);
  const orgs = orgRows ?? [];
  const demoIds = orgs.filter((o) => o.is_demo).map((o) => o.id);
  const notDemo = <T extends { or: (f: string) => T }>(q: T): T =>
    demoIds.length ? q.or(`organization_id.is.null,organization_id.not.in.(${demoIds.join(",")})`) : q;
  const realOrg = <T extends { not: (c: string, o: string, v: string) => T; filter: (c: string, o: string, v: string) => T }>(q: T): T =>
    demoIds.length ? q.not("organization_id", "in", `(${demoIds.join(",")})`) : q;
  const count = (t: "properties" | "leads", from: string, to?: string) => {
    let q = admin.from(t).select("id", { count: "exact", head: true }).is("deleted_at", null).gte("created_at", from);
    if (to) q = q.lt("created_at", to);
    return realOrg(q);
  };
  const ops = (success: boolean) =>
    notDemo(
      admin
        .from("portal_operation_logs")
        .select("id", { count: "exact", head: true })
        .in("operation", [...WEEK_PORTAL_OPERATIONS])
        .eq("success", success)
        .gte("created_at", since),
    );

  const [props, propsPrev, leads, leadsPrev, okOps, badOps, members] = await Promise.all([
    count("properties", since),
    count("properties", prev, since),
    count("leads", since),
    count("leads", prev, since),
    ops(true),
    ops(false),
    realOrg(admin.from("profiles").select("id").not("organization_id", "is", null)),
  ]);
  const failed = ([["proprietăți", props], ["proprietăți anterioare", propsPrev], ["lead-uri", leads], ["lead-uri anterioare", leadsPrev], ["operațiuni reușite", okOps], ["operațiuni eșuate", badOps], ["utilizatori", members]] as [string, { error: { message: string } | null }][]).filter(([, r]) => r.error);
  if (failed.length) throw new Error(`Interogările dashboardului au eșuat — ${failed.map(([l, r]) => `${l}: ${r.error?.message}`).join(" | ")}`);

  const ids = (members.data ?? []).map((m) => m.id);
  const since7 = now - 7 * 86_400_000;
  const active = orgs.filter((o) => !o.is_demo && o.status === "active" && !o.archived_at);
  return {
    activeAgencies: active.length,
    trialAgencies: active.filter((o) => o.is_trial).length,
    paidAgencies: active.filter((o) => !o.is_trial).length,
    activeUsers: ids.filter((id) => isActiveLogin(lastLogin.get(id), since7)).length,
    totalUsers: ids.length,
    newProperties: props.count ?? 0,
    newPropertiesPrev: propsPrev.count ?? 0,
    newLeads: leads.count ?? 0,
    newLeadsPrev: leadsPrev.count ?? 0,
    portalSuccess: okOps.count ?? 0,
    portalFailed: badOps.count ?? 0,
  };
}

/** O singură parcurgere Auth; din ea citim doar `last_sign_in_at`. */
async function loadLastLogins(admin: Admin): Promise<Map<string, string | null>> {
  const lastLogin = new Map<string, string | null>();
  for (let page = 1; page <= 50; page++) {
    const { data, error: authErr } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (authErr) throw new Error("Ultimele autentificări nu au putut fi citite.");
    for (const u of data.users) lastLogin.set(u.id, u.last_sign_in_at ?? null);
    if (data.users.length < 1000) break;
  }
  return lastLogin;
}

/** Cardul „Agenții”: numărători agregate per agenție activă, non-demo. */
async function buildAgencyRows(admin: Admin, lastLogin: Map<string, string | null>): Promise<AgencyRow[]> {
  const { data: orgRows, error } = await admin
    .from("organizations")
    .select("id,name,plan,is_demo,status,archived_at,is_trial,subscription_term,subscription_expires_at");
  if (error) throw new Error(`Interogările dashboardului au eșuat — agenții: ${error.message}`);
  const orgs = (orgRows ?? []).filter((o) => !o.is_demo && o.status === "active" && !o.archived_at);
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const head = { count: "exact" as const, head: true };
  const stats = await Promise.all(
    orgs.map(async (o) => {
      const [props, leads, conns, errs, members] = await Promise.all([
        admin.from("properties").select("id", head).eq("organization_id", o.id).eq("status", "active").is("deleted_at", null),
        admin.from("leads").select("id", head).eq("organization_id", o.id).is("deleted_at", null).gte("created_at", since30),
        admin.from("portal_connections").select("id", head).eq("organization_id", o.id).eq("activated", true),
        admin.from("portal_publications").select("id", head).eq("organization_id", o.id).eq("enabled", true).eq("status", "error").neq("portal_key", "facebook_catalog"),
        admin.from("profiles").select("id").eq("organization_id", o.id),
      ]);
      const bad = [props, leads, conns, errs, members].find((r) => r.error);
      if (bad?.error) throw new Error(`Interogările dashboardului au eșuat — agenții: ${bad.error.message}`);
      const ids = (members.data ?? []).map((m) => m.id);
      return {
        id: o.id,
        name: o.name,
        plan: o.plan,
        isTrial: o.is_trial ?? false,
        term: o.subscription_term,
        expiresAt: o.subscription_expires_at,
        users: ids.length,
        activeProperties: props.count ?? 0,
        leads30: leads.count ?? 0,
        portals: conns.count ?? 0,
        errors: errs.count ?? 0,
        lastLoginAt: ids.map((id) => lastLogin.get(id) ?? null).filter((x): x is string => !!x).sort().at(-1) ?? null,
      };
    }),
  );
  return buildAgencyRowsFrom(stats, Date.now()).slice(0, AGENCY_ROW_LIMIT);
}
