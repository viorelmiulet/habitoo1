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
  termLabel,
  type SubscriptionAlert,
  type SuperadminTodo,
} from "@/lib/superadmin-todo";
import { AGENCY_ROW_LIMIT, buildAgencyRowsFrom, type AgencyRow } from "@/lib/superadmin-agencies";
import { buildPortalCardsFrom, type PortalCard } from "@/lib/superadmin-portals";
import { isActiveLogin, type SuperadminWeek } from "@/lib/superadmin-week";
import { isConnectionError, portalHealth } from "@/lib/portal-connection-health";

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

export type SuperadminDashboard = {
  todo: SuperadminTodo;
  week: SuperadminWeek;
  agencies: AgencyRow[];
  portals: PortalCard[];
};

export const getSuperadminDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SuperadminDashboard> => {
    await assertSuperadmin(context as AuthContext);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");

    const [lastLogin, health] = await Promise.all([loadLastLogins(admin), loadConnectionHealth(admin)]);
    const [todo, week, agencies, portals] = await Promise.all([
      buildTodo(admin, health),
      buildWeek(admin, lastLogin),
      buildAgencyRows(admin, lastLogin, health),
      buildPortalCards(admin, health),
    ]);

    return { todo, week, agencies, portals };
  });

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

type ConnHealth = { id: string; organizationId: string; organizationName: string; portal: string; broken: boolean };

/** Starea fiecărei conexiuni activate (agenții non-demo): doar erori de conectare. */
async function loadConnectionHealth(admin: Admin): Promise<ConnHealth[]> {
  const { data: orgRows, error } = await admin.from("organizations").select("id,name,is_demo");
  if (error) throw new Error(`Interogările dashboardului au eșuat — organizații: ${error.message}`);
  const orgs = new Map((orgRows ?? []).filter((o) => !o.is_demo).map((o) => [o.id, o.name]));
  const { data: conns, error: cErr } = await admin
    .from("portal_connections")
    .select("id,organization_id,portal,status,last_sync_status,last_sync_error")
    .eq("activated", true)
    .neq("portal", "facebook_catalog");
  if (cErr) throw new Error(`Interogările dashboardului au eșuat — conexiuni: ${cErr.message}`);
  return Promise.all(
    (conns ?? [])
      .filter((c) => orgs.has(c.organization_id))
      .map(async (c) => {
        const { data: ops, error: oErr } = await admin
          .from("portal_operation_logs")
          .select("success,error_code,http_status,error_message")
          .eq("organization_id", c.organization_id)
          .eq("portal", c.portal)
          .order("created_at", { ascending: false })
          .limit(3);
        if (oErr) throw new Error(`Interogările dashboardului au eșuat — operații: ${oErr.message}`);
        return {
          id: c.id,
          organizationId: c.organization_id,
          organizationName: orgs.get(c.organization_id) ?? "—",
          portal: c.portal,
          broken: isConnectionError({
            status: c.status,
            lastSyncStatus: c.last_sync_status,
            lastSyncError: c.last_sync_error,
            recentOps: (ops ?? []).map((o) => ({ success: o.success, errorCode: o.error_code, httpStatus: o.http_status, errorMessage: o.error_message })),
          }),
        };
      }),
  );
}

/** Blocul „De rezolvat”: numărători agregate, agențiile demo excluse peste tot. */
async function buildTodo(admin: Admin, health: ConnHealth[]): Promise<SuperadminTodo> {
  const { data: orgRows, error: orgErr } = await admin
    .from("organizations")
    .select("id,name,is_demo,status,archived_at,is_trial,subscription_term,subscription_expires_at");
  if (orgErr) throw new Error(`Interogările dashboardului au eșuat — organizații: ${orgErr.message}`);
  const orgs = orgRows ?? [];
  const demoIds = orgs.filter((o) => o.is_demo).map((o) => o.id);
  // Rândurile fără agenție (ex. cereri de înscriere noi) rămân incluse.
  const notDemo = <T extends { or: (f: string) => T }>(q: T): T =>
    demoIds.length ? q.or(`organization_id.is.null,organization_id.not.in.(${demoIds.join(",")})`) : q;

  const [reg, subs, act, tick] = await Promise.all([
    notDemo(admin.from("agency_registration_requests").select("id", { count: "exact", head: true }).eq("status", "pending")),
    notDemo(admin.from("subscription_requests").select("id", { count: "exact", head: true }).eq("status", "pending")),
    notDemo(admin.from("portal_activation_requests").select("id", { count: "exact", head: true }).eq("status", "pending")),
    notDemo(admin.from("support_tickets").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"])),
  ]);
  const failed = (
    [["cereri de înscriere", reg], ["cereri de abonament", subs], ["activări portal", act], ["tichete", tick]] as [string, { error: { message: string } | null }][]
  ).filter(([, r]) => r.error);
  if (failed.length) {
    throw new Error(`Interogările dashboardului au eșuat — ${failed.map(([l, r]) => `${l}: ${r.error?.message}`).join(" | ")}`);
  }

  const broken = health.filter((h) => h.broken);
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
      failingConnections: broken.length,
    },
    expiring: alerts.filter((a) => a.kind === "expiring").sort((x, y) => x.daysLeft - y.daysLeft).map(strip),
    expired: alerts.filter((a) => a.kind === "expired").sort((x, y) => x.daysLeft - y.daysLeft).map(strip),
    // Anunțurile nepublicabile țin de munca agențiilor, nu de platformă.
    blocked: [],
    brokenConnections: broken.map((h) => ({ organizationId: h.organizationId, organizationName: h.organizationName, portal: h.portal })),
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
  const realOrg = <T extends { not: (c: string, o: string, v: string) => T; filter: (c: string, o: string, v: string) => T }>(q: T): T =>
    demoIds.length ? q.not("organization_id", "in", `(${demoIds.join(",")})`) : q;
  const count = (from: string, to?: string) => {
    let q = admin.from("properties").select("id", { count: "exact", head: true }).is("deleted_at", null).gte("created_at", from);
    if (to) q = q.lt("created_at", to);
    return realOrg(q);
  };


  const [props, propsPrev, members] = await Promise.all([
    count(since),
    count(prev, since),
    realOrg(admin.from("profiles").select("id").not("organization_id", "is", null)),
  ]);
  const failed = ([["proprietăți", props], ["proprietăți anterioare", propsPrev], ["utilizatori", members]] as [string, { error: { message: string } | null }][]).filter(([, r]) => r.error);
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
async function buildAgencyRows(admin: Admin, lastLogin: Map<string, string | null>, health: ConnHealth[]): Promise<AgencyRow[]> {
  const { data: orgRows, error } = await admin
    .from("organizations")
    .select("id,name,plan,is_demo,status,archived_at,is_trial,subscription_term,subscription_expires_at");
  if (error) throw new Error(`Interogările dashboardului au eșuat — agenții: ${error.message}`);
  const orgs = (orgRows ?? []).filter((o) => !o.is_demo && o.status === "active" && !o.archived_at);
  const head = { count: "exact" as const, head: true };
  const stats = await Promise.all(
    orgs.map(async (o) => {
      const [props, conns, members] = await Promise.all([
        admin.from("properties").select("id", head).eq("organization_id", o.id).eq("status", "active").is("deleted_at", null),
        admin.from("portal_connections").select("id", head).eq("organization_id", o.id).eq("activated", true),
        admin.from("profiles").select("id").eq("organization_id", o.id),
      ]);
      const bad = [props, conns, members].find((r) => r.error);
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
        portals: conns.count ?? 0,
        connectionErrors: health.filter((h) => h.organizationId === o.id && h.broken).length,
        lastLoginAt: ids.map((id) => lastLogin.get(id) ?? null).filter((x): x is string => !!x).sort().at(-1) ?? null,
      };
    }),
  );
  return buildAgencyRowsFrom(stats, Date.now()).slice(0, AGENCY_ROW_LIMIT);
}

/** Secțiunea „Portaluri”: câte un card pe portal cu conexiuni activate la agenții non-demo. */
async function buildPortalCards(admin: Admin, health: ConnHealth[]): Promise<PortalCard[]> {
  const { data: orgRows, error } = await admin.from("organizations").select("id,is_demo");
  if (error) throw new Error(`Interogările dashboardului au eșuat — organizații: ${error.message}`);
  const demoIds = (orgRows ?? []).filter((o) => o.is_demo).map((o) => o.id);
  const byPortal = new Map<string, { orgs: Set<string>; failing: Set<string> }>();
  for (const h of health) {
    const g = byPortal.get(h.portal) ?? { orgs: new Set<string>(), failing: new Set<string>() };
    g.orgs.add(h.organizationId);
    if (h.broken) g.failing.add(h.organizationId);
    byPortal.set(h.portal, g);
  }
  const head = { count: "exact" as const, head: true };
  const counted = await Promise.all(
    [...byPortal.entries()].map(async ([portal, g]) => {
      let q = admin.from("portal_publications").select("id", head).eq("portal_key", portal).eq("enabled", true).eq("status", "synced");
      if (demoIds.length) q = q.not("organization_id", "in", `(${demoIds.join(",")})`);
      const { count, error: e } = await q;
      if (e) throw new Error(`Interogările dashboardului au eșuat — publicări: ${e.message}`);
      const failing = g.failing.size;
      return { portal, agencies: g.orgs.size, published: count ?? 0, failingAgencies: failing, state: portalHealth(g.orgs.size, failing) };
    }),
  );
  return buildPortalCardsFrom(counted);
}
