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
import { WEEK_PORTAL_OPERATIONS, isActiveLogin, type SuperadminWeek } from "@/lib/superadmin-week";
import { PLATFORM_ERROR_CODE_FILTER, countPlatformPublicationErrors } from "@/lib/portal-error-class";

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

    const lastLogin = await loadLastLogins(admin);
    const [todo, week, agencies, portals] = await Promise.all([
      buildTodo(admin),
      buildWeek(admin, lastLogin),
      buildAgencyRows(admin, lastLogin),
      buildPortalCards(admin),
    ]);

    return { todo, week, agencies, portals };
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
  // Rândurile fără agenție (ex. cereri de înscriere noi) rămân incluse.
  const notDemo = <T extends { or: (f: string) => T }>(q: T): T =>
    demoIds.length ? q.or(`organization_id.is.null,organization_id.not.in.(${demoIds.join(",")})`) : q;

  const [reg, subs, act, tick, conns] = await Promise.all([
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
  ]);
  const failed = (
    [["cereri de înscriere", reg], ["cereri de abonament", subs], ["activări portal", act], ["tichete", tick], ["conexiuni", conns]] as [string, { error: { message: string } | null }][]
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
    // Anunțurile nepublicabile țin de munca agențiilor, nu de platformă.
    blocked: [],
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
  const count = (from: string, to?: string) => {
    let q = admin.from("properties").select("id", { count: "exact", head: true }).is("deleted_at", null).gte("created_at", from);
    if (to) q = q.lt("created_at", to);
    return realOrg(q);
  };
  const ops = (success: boolean) => {
    const q = notDemo(
      admin
        .from("portal_operation_logs")
        .select("id", { count: "exact", head: true })
        .in("operation", [...WEEK_PORTAL_OPERATIONS])
        .eq("success", success)
        .gte("created_at", since),
    );
    // Eșecurile de completare a anunțului nu intră în rata platformei.
    return success ? q : q.or(PLATFORM_ERROR_CODE_FILTER);
  };

  const [props, propsPrev, okOps, badOps, members] = await Promise.all([
    count(since),
    count(prev, since),
    ops(true),
    ops(false),
    realOrg(admin.from("profiles").select("id").not("organization_id", "is", null)),
  ]);
  const failed = ([["proprietăți", props], ["proprietăți anterioare", propsPrev], ["operațiuni reușite", okOps], ["operațiuni eșuate", badOps], ["utilizatori", members]] as [string, { error: { message: string } | null }][]).filter(([, r]) => r.error);
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
  const head = { count: "exact" as const, head: true };
  const stats = await Promise.all(
    orgs.map(async (o) => {
      const [props, conns, errs, members] = await Promise.all([
        admin.from("properties").select("id", head).eq("organization_id", o.id).eq("status", "active").is("deleted_at", null),
        admin.from("portal_connections").select("id", head).eq("organization_id", o.id).eq("activated", true),
        admin.from("portal_publications").select("last_error").eq("organization_id", o.id).eq("enabled", true).eq("status", "error").neq("portal_key", "facebook_catalog"),
        admin.from("profiles").select("id").eq("organization_id", o.id),
      ]);
      const bad = [props, conns, errs, members].find((r) => r.error);
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
        errors: countPlatformPublicationErrors(errs.data ?? []),
        lastLoginAt: ids.map((id) => lastLogin.get(id) ?? null).filter((x): x is string => !!x).sort().at(-1) ?? null,
      };
    }),
  );
  return buildAgencyRowsFrom(stats, Date.now()).slice(0, AGENCY_ROW_LIMIT);
}

/** Secțiunea „Portaluri”: câte un card pe portal cu conexiuni activate la agenții non-demo. */
async function buildPortalCards(admin: Admin): Promise<PortalCard[]> {
  const { data: orgRows, error } = await admin.from("organizations").select("id,is_demo");
  if (error) throw new Error(`Interogările dashboardului au eșuat — organizații: ${error.message}`);
  const demo = new Set((orgRows ?? []).filter((o) => o.is_demo).map((o) => o.id));
  const { data: conns, error: cErr } = await admin
    .from("portal_connections")
    .select("organization_id,portal")
    .eq("activated", true)
    .neq("portal", "facebook_catalog");
  if (cErr) throw new Error(`Interogările dashboardului au eșuat — conexiuni: ${cErr.message}`);
  const agencies = new Map<string, Set<string>>();
  for (const c of conns ?? []) {
    if (demo.has(c.organization_id)) continue;
    const set = agencies.get(c.portal) ?? new Set<string>();
    set.add(c.organization_id);
    agencies.set(c.portal, set);
  }
  const demoIds = [...demo];
  const head = { count: "exact" as const, head: true };
  const counted = await Promise.all(
    [...agencies.entries()].map(async ([portal, orgs]) => {
      const q = (status: string) => {
        let x = admin.from("portal_publications").select(status === "error" ? "last_error" : "id", status === "error" ? undefined : head).eq("portal_key", portal).eq("enabled", true).eq("status", status);
        if (demoIds.length) x = x.not("organization_id", "in", `(${demoIds.join(",")})`);
        return x;
      };
      const [ok, bad] = await Promise.all([q("synced"), q("error")]);
      const e = ok.error ?? bad.error;
      if (e) throw new Error(`Interogările dashboardului au eșuat — publicări: ${e.message}`);
      return { portal, agencies: orgs.size, published: ok.count ?? 0, errors: countPlatformPublicationErrors((bad.data ?? []) as unknown as { last_error: string | null }[]) };
    }),
  );
  return buildPortalCardsFrom(counted);
}
