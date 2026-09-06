// Server functions pentru pagina „Agenți” a agenției.
// Fiecare handler re-verifică rolul de administrator de agenție pe server (prin RPC-ul
// acoperit de RLS) înainte de a folosi clientul service-role, iar limita planului este
// aplicată server-side, nu doar în interfață.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { planAgentLimit, planLabel, normalizePlan, nextPlan, type PlanKey } from "@/lib/plans";
import { getCrmUrl } from "@/lib/host";

type AuthContext = {
  supabase: {
    rpc: (fn: "is_org_admin") => PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, value: string) => {
          maybeSingle: () => PromiseLike<{ data: { organization_id: string | null } | null; error: unknown }>;
        };
      };
    };
  };
  userId: string;
};

export type TeamMember = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  roles: string[];
  invited: boolean;
};

export type TeamOverview = {
  organizationId: string;
  organizationName: string;
  plan: PlanKey;
  planLabel: string;
  seatLimit: number;
  seatsUsed: number;
  canInvite: boolean;
  upgradeHint: string | null;
  members: TeamMember[];
};

async function requireOrgAdmin(context: AuthContext) {
  const { data: isAdmin, error } = await context.supabase.rpc("is_org_admin");
  if (error || isAdmin !== true) {
    throw new Error("Acces refuzat: doar administratorul agenției poate gestiona agenții.");
  }
  const { data: profile } = await context.supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", context.userId)
    .maybeSingle();
  const organizationId = profile?.organization_id ?? null;
  if (!organizationId) throw new Error("Agenția nu este configurată pentru acest cont.");
  return { organizationId, actorId: context.userId };
}

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Admin = Awaited<ReturnType<typeof loadAdmin>>;

async function buildOverview(admin: Admin, organizationId: string): Promise<TeamOverview> {
  const [org, profiles, roles] = await Promise.all([
    admin.from("organizations").select("id,name,plan").eq("id", organizationId).maybeSingle(),
    admin
      .from("profiles")
      .select("id,full_name,email,phone,job_title,avatar_url,is_active,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true }),
    admin.from("user_roles").select("user_id,role").eq("organization_id", organizationId),
  ]);
  if (org.error) throw org.error;
  if (!org.data) throw new Error("Agenția nu a fost găsită.");
  if (profiles.error) throw profiles.error;

  const roleRows = roles.data ?? [];
  const members: TeamMember[] = await Promise.all(
    (profiles.data ?? []).map(async (p) => {
      const { data: authUser } = await admin.auth.admin.getUserById(p.id);
      const user = authUser?.user;
      return {
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        phone: p.phone,
        job_title: p.job_title,
        avatar_url: p.avatar_url,
        is_active: p.is_active,
        created_at: p.created_at,
        roles: roleRows.filter((r) => r.user_id === p.id).map((r) => r.role as string),
        invited: !user?.last_sign_in_at,
      };
    }),
  );

  const plan = normalizePlan(org.data.plan);
  const seatLimit = planAgentLimit(plan);
  const seatsUsed = members.filter((m) => m.roles.includes("agent") && m.is_active).length;
  const upgrade = nextPlan(plan);

  return {
    organizationId,
    organizationName: org.data.name,
    plan,
    planLabel: planLabel(plan),
    seatLimit,
    seatsUsed,
    canInvite: seatsUsed < seatLimit,
    upgradeHint:
      seatsUsed < seatLimit
        ? null
        : upgrade
          ? `Ai atins limita planului ${planLabel(plan)} de ${seatLimit} agenți — treci la ${planLabel(upgrade)} pentru mai mulți.`
          : `Ai atins limita planului ${planLabel(plan)} de ${seatLimit} agenți. Contactează-ne pentru un plan personalizat.`,
    members,
  };
}

async function writeAudit(
  admin: Admin,
  input: { organizationId: string; actorId: string; action: string; entityId: string; values: Record<string, string | number | boolean | null> },
) {
  await admin.from("audit_logs").insert({
    organization_id: input.organizationId,
    actor_id: input.actorId,
    action: input.action,
    entity: "profiles",
    entity_id: input.entityId,
    new_values: input.values,
    created_by: input.actorId,
  });
}

/** Caută un utilizator Auth existent după email (contul poate exista fără profil). */
async function findAuthUserByEmail(admin: Admin, email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const users = data?.users ?? [];
    const match = users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (match) return match;
    if (users.length < 200) return null;
  }
  return null;
}

/**
 * Trimite emailul de setare a parolei (flux de resetare parolă).
 * Este singurul email primit de agentul invitat, în ambele situații: cont nou creat
 * de administrator sau cont Auth deja existent fără profil. Numele agenției călătorește
 * prin `redirect_to`, ca webhookul de email să poată personaliza mesajul.
 */
async function sendPasswordSetupEmail(email: string, agencyName?: string) {
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_PUBLISHABLE_KEY"]!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const path = agencyName
    ? `/reset-password?agency=${encodeURIComponent(agencyName)}`
    : "/reset-password";
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: getCrmUrl(path),
  });
  if (error) throw new Error(`Emailul de setare a parolei nu a putut fi trimis: ${error.message}`);
}

export const getTeamOverview = createServerFn({ method: "GET" })

  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<TeamOverview> => {
    const { organizationId } = await requireOrgAdmin(context as unknown as AuthContext);
    return buildOverview(await loadAdmin(), organizationId);
  });

export const inviteAgent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        email: z.string().trim().email("Adresa de email nu este validă."),
        full_name: z.string().trim().min(2, "Numele agentului este obligatoriu."),
      })
      .parse(data),
  )
  .middleware([requireActiveOrgAuth])
  .handler(async ({ data, context }): Promise<TeamOverview> => {
    const { organizationId, actorId } = await requireOrgAdmin(context as unknown as AuthContext);
    const admin = await loadAdmin();

    // Limita planului se verifică server-side, imediat înainte de creare.
    const before = await buildOverview(admin, organizationId);
    if (!before.canInvite) {
      throw new Error(before.upgradeHint ?? "Ai atins limita de agenți a planului.");
    }

    const email = data.email.toLowerCase();
    const existing = await admin.from("profiles").select("id,organization_id").eq("email", email).maybeSingle();
    if (existing.data) {
      throw new Error(
        existing.data.organization_id === organizationId
          ? "Această persoană face deja parte din agenția ta."
          : "Această adresă de email este deja folosită de un cont din altă agenție.",
      );
    }

    // Numele agenției ajunge în emailul de invitație prin parametrul din redirect_to:
    // webhookul de email nu primește metadatele utilizatorului.
    const org = await admin
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .maybeSingle();
    const agencyName = (org.data?.name ?? "").trim() || undefined;

    // Flux unificat: contul este creat direct de administrator (fără parolă utilizabilă),
    // iar agentul primește UN SINGUR email — cel de setare/resetare a parolei. Nu folosim
    // invitația standard Supabase, ca formatul emailului să fie mereu același.
    let newUserId: string;
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: crypto.randomUUID() + crypto.randomUUID(),
      user_metadata: { full_name: data.full_name, invited_by_agency: agencyName ?? null },
    });

    if (created.data?.user) {
      newUserId = created.data.user.id;
    } else {
      // Contul poate exista deja în Auth fără profil (agenție ștearsă anterior sau
      // înregistrare neterminată): îl atașăm agenției fără să îl recreăm.
      const orphan = await findAuthUserByEmail(admin, email);
      if (!orphan) {
        throw new Error(created.error?.message ?? "Contul agentului nu a putut fi creat.");
      }
      newUserId = orphan.id;
      await admin.auth.admin.updateUserById(newUserId, {
        user_metadata: { full_name: data.full_name, invited_by_agency: agencyName ?? null },
      });
    }

    await sendPasswordSetupEmail(email, agencyName);

    const profile = await admin.from("profiles").upsert({
      id: newUserId,
      organization_id: organizationId,
      full_name: data.full_name,
      email,
      is_active: true,
    });
    if (profile.error) throw profile.error;

    const role = await admin
      .from("user_roles")
      .upsert({ user_id: newUserId, organization_id: organizationId, role: "agent" }, { onConflict: "user_id,role" });
    if (role.error) throw role.error;

    await writeAudit(admin, {
      organizationId,
      actorId,
      action: "team.agent_invited",
      entityId: newUserId,
      values: { email, full_name: data.full_name, plan: before.plan, seats_used: before.seatsUsed + 1 },
    });

    return buildOverview(admin, organizationId);
  });

export const setAgentActive = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ userId: z.string().uuid(), isActive: z.boolean() }).parse(data),
  )
  .middleware([requireActiveOrgAuth])
  .handler(async ({ data, context }): Promise<TeamOverview> => {
    const { organizationId, actorId } = await requireOrgAdmin(context as unknown as AuthContext);
    const admin = await loadAdmin();

    const target = await admin
      .from("profiles")
      .select("id,organization_id")
      .eq("id", data.userId)
      .maybeSingle();
    if (!target.data || target.data.organization_id !== organizationId) {
      throw new Error("Utilizatorul nu face parte din agenția ta.");
    }
    if (data.userId === actorId) throw new Error("Nu îți poți dezactiva propriul cont.");

    if (data.isActive) {
      const before = await buildOverview(admin, organizationId);
      if (!before.canInvite) {
        throw new Error(before.upgradeHint ?? "Ai atins limita de agenți a planului.");
      }
    }

    const update = await admin.from("profiles").update({ is_active: data.isActive }).eq("id", data.userId);
    if (update.error) throw update.error;

    await writeAudit(admin, {
      organizationId,
      actorId,
      action: data.isActive ? "team.agent_reactivated" : "team.agent_deactivated",
      entityId: data.userId,
      values: { is_active: data.isActive },
    });

    return buildOverview(admin, organizationId);
  });

export const removeAgent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .middleware([requireActiveOrgAuth])
  .handler(async ({ data, context }): Promise<TeamOverview> => {
    const { organizationId, actorId } = await requireOrgAdmin(context as unknown as AuthContext);
    if (data.userId === actorId) throw new Error("Nu îți poți elimina propriul cont.");
    const admin = await loadAdmin();

    const target = await admin
      .from("profiles")
      .select("id,organization_id,email,full_name")
      .eq("id", data.userId)
      .maybeSingle();
    if (!target.data || target.data.organization_id !== organizationId) {
      throw new Error("Utilizatorul nu face parte din agenția ta.");
    }

    const roles = await admin.from("user_roles").select("role").eq("user_id", data.userId);
    const roleList = (roles.data ?? []).map((r) => r.role as string);
    if (roleList.includes("superadmin") || roleList.includes("agency_admin")) {
      throw new Error("Administratorii agenției nu pot fi eliminați din această pagină.");
    }

    await admin.from("user_roles").delete().eq("user_id", data.userId);
    const del = await admin.from("profiles").delete().eq("id", data.userId);
    if (del.error) throw del.error;
    await admin.auth.admin.deleteUser(data.userId);

    await writeAudit(admin, {
      organizationId,
      actorId,
      action: "team.agent_removed",
      entityId: data.userId,
      values: { email: target.data.email, full_name: target.data.full_name },
    });

    return buildOverview(admin, organizationId);
  });
