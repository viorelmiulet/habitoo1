// Administrarea completă a conturilor din platformă, exclusiv pentru superadmin.
// Rolul este verificat pe server (RPC acoperit de RLS) și încă o dată în funcțiile SQL
// `superadmin_reassign_user_data` / `superadmin_delete_user`, care rulează tranzacțional.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNoActiveImpersonation } from "@/lib/impersonation.functions";

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
  return context.userId;
}

export type PlatformUser = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: string;
  organization_id: string | null;
  organization_name: string | null;
  roles: string[];
};

export type PlatformUsersOverview = {
  users: PlatformUser[];
  organizations: { id: string; name: string }[];
};

export const listPlatformUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformUsersOverview> => {
    await assertSuperadmin(context as AuthContext);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: profiles, error }, { data: roles }, { data: orgs }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select(
          "id,full_name,email,phone,job_title,avatar_url,is_active,created_at,organization_id",
        )
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("user_roles").select("user_id,role"),
      supabaseAdmin.from("organizations").select("id,name").order("name"),
    ]);
    if (error) throw new Error(error.message);

    const orgList = (orgs ?? []).map((o) => ({ id: o.id, name: o.name }));
    const orgById = new Map(orgList.map((o) => [o.id, o.name]));

    return {
      organizations: orgList,
      users: (profiles ?? []).map((p) => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        phone: p.phone,
        job_title: p.job_title,
        avatar_url: p.avatar_url,
        is_active: p.is_active,
        created_at: p.created_at,
        organization_id: p.organization_id,
        organization_name: p.organization_id ? (orgById.get(p.organization_id) ?? null) : null,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as string),
      })),
    };
  });

/** Datele asignate unui utilizator (folosite pentru avertismentul de realocare). */
export const getUserWorkload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<Record<string, number>> => {
    const actorId = await assertSuperadmin(context as AuthContext);
    await assertNoActiveImpersonation(actorId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("superadmin_user_workload", {
      _user: data.userId,
      _actor: actorId,
    });
    if (error) throw new Error(error.message);
    return (result ?? {}) as Record<string, number>;
  });

const profilePatch = z.object({
  userId: z.string().uuid(),
  full_name: z.string().trim().min(2, "Numele este obligatoriu."),
  email: z.string().trim().email("Email invalid.").nullable(),
  phone: z.string().trim().max(40).nullable(),
  job_title: z.string().trim().max(80).nullable(),
  role: z.enum(["agent", "agency_admin"]).nullable(),
  organizationId: z.string().uuid().nullable(),
});

/** Editarea unui profil: date de contact, rol și agenție. Totul jurnalizat în audit_logs. */
export const updatePlatformUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => profilePatch.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const actorId = await assertSuperadmin(context as AuthContext);
    await assertNoActiveImpersonation(actorId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: before, error: beforeError } = await supabaseAdmin
      .from("profiles")
      .select("id,full_name,email,phone,job_title,organization_id")
      .eq("id", data.userId)
      .maybeSingle();
    if (beforeError) throw new Error(beforeError.message);
    if (!before) throw new Error("Utilizatorul nu există.");

    const { data: rolesBefore } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    const roleList = (rolesBefore ?? []).map((r) => r.role as string);
    const isSuperadmin = roleList.includes("superadmin");

    // 1. Câmpurile de profil.
    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: data.full_name,
        email: data.email,
        phone: data.phone,
        job_title: data.job_title,
      })
      .eq("id", data.userId);
    if (updateError) throw new Error(updateError.message);

    // 2. Emailul de autentificare, dacă s-a schimbat.
    if (data.email && data.email.toLowerCase() !== (before.email ?? "").toLowerCase()) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
        email: data.email,
        email_confirm: true,
      });
      if (authError) {
        throw new Error(`Emailul de autentificare nu a putut fi schimbat: ${authError.message}`);
      }
    }

    // 3. Agenția (funcție dedicată, cu audit propriu).
    if (data.organizationId !== before.organization_id) {
      if (isSuperadmin)
        throw new Error("Agenția unui superadmin nu se schimbă din această pagină.");
      const { error: moveError } = await supabaseAdmin.rpc("admin_change_user_organization", {
        _user_id: data.userId,
        _new_org: data.organizationId as string,
      });
      if (moveError) throw new Error(moveError.message);
    }

    // 4. Rolul în agenție (superadminii nu sunt atinși).
    if (data.role && !isSuperadmin && !roleList.includes(data.role)) {
      const { error: delError } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .in("role", ["agent", "agency_admin"]);
      if (delError) throw new Error(delError.message);
      const { error: insError } = await supabaseAdmin.from("user_roles").insert({
        user_id: data.userId,
        organization_id: data.organizationId,
        role: data.role,
      });
      if (insError) throw new Error(insError.message);
    }

    await supabaseAdmin.from("audit_logs").insert({
      organization_id: data.organizationId,
      actor_id: actorId,
      action: "user.profile_updated",
      entity: "profiles",
      entity_id: data.userId,
      old_values: { ...before, roles: roleList },
      new_values: {
        full_name: data.full_name,
        email: data.email,
        phone: data.phone,
        job_title: data.job_title,
        organization_id: data.organizationId,
        role: data.role,
      },
      created_by: actorId,
    });

    return { ok: true };
  });

/** Activare / dezactivare cont. */
export const setPlatformUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ userId: z.string().uuid(), isActive: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const actorId = await assertSuperadmin(context as AuthContext);
    await assertNoActiveImpersonation(actorId);
    if (data.userId === actorId && !data.isActive) {
      throw new Error("Nu îți poți dezactiva propriul cont de superadmin.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: before } = await supabaseAdmin
      .from("profiles")
      .select("is_active,organization_id")
      .eq("id", data.userId)
      .maybeSingle();

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_active: data.isActive })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_logs").insert({
      organization_id: before?.organization_id ?? null,
      actor_id: actorId,
      action: data.isActive ? "user.activated" : "user.deactivated",
      entity: "profiles",
      entity_id: data.userId,
      old_values: { is_active: before?.is_active ?? null },
      new_values: { is_active: data.isActive },
      created_by: actorId,
    });

    return { ok: true };
  });

/** Realocare independentă: mută tot ce e asignat sursei către destinație. */
export const reassignUserData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ fromUserId: z.string().uuid(), toUserId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<Record<string, number>> => {
    const actorId = await assertSuperadmin(context as AuthContext);
    await assertNoActiveImpersonation(actorId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("superadmin_reassign_user_data", {
      _from: data.fromUserId,
      _to: data.toUserId,
      _actor: actorId,
    });
    if (error) throw new Error(error.message);
    return (result ?? {}) as Record<string, number>;
  });

export type DeleteUserResult = {
  userId: string;
  fullName: string | null;
  moved: Record<string, number>;
  authDeleted: boolean;
  authError: string | null;
};

/** Ștergere definitivă: realocare obligatorie a datelor, apoi profil, roluri și cont de autentificare. */
export const deletePlatformUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        reassignToUserId: z.string().uuid().nullable(),
        confirmName: z.string().trim().min(1, "Scrie numele contului pentru confirmare."),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<DeleteUserResult> => {
    const actorId = await assertSuperadmin(context as AuthContext);
    await assertNoActiveImpersonation(actorId);
    if (data.userId === actorId) throw new Error("Nu îți poți șterge propriul cont.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id,full_name")
      .eq("id", data.userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile) throw new Error("Utilizatorul nu există sau a fost deja șters.");
    if (profile.full_name.trim() !== data.confirmName.trim()) {
      throw new Error("Numele scris nu corespunde numelui contului.");
    }

    const { data: result, error } = await supabaseAdmin.rpc("superadmin_delete_user", {
      _user: data.userId,
      _reassign_to: data.reassignToUserId as string,
      _actor: actorId,
    });
    if (error) throw new Error(error.message);

    const payload = (result ?? {}) as { full_name?: string; moved?: Record<string, number> };

    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(data.userId);

    return {
      userId: data.userId,
      fullName: payload.full_name ?? profile.full_name,
      moved: payload.moved ?? {},
      authDeleted: !authError,
      authError: authError?.message ?? null,
    };
  });
