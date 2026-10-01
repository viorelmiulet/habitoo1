// Pornirea și urmărirea joburilor de ștergere a conturilor; exclusiv superadmin.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNoActiveImpersonation } from "@/lib/impersonation.functions";

type AuthContext = {
  supabase: { rpc: (fn: "is_superadmin") => PromiseLike<{ data: boolean | null; error: { message: string } | null }> };
  userId: string;
};

async function assertSuperadmin(context: AuthContext) {
  const { data, error } = await context.supabase.rpc("is_superadmin");
  if (error || data !== true) throw new Error("Acces refuzat: acțiunea este permisă exclusiv superadminului.");
  return context.userId;
}

const startSchema = z.object({
  kind: z.enum(["user", "organization"]),
  targetId: z.string().uuid(),
  mode: z.enum(["reassign", "delete"]),
  reassignToUserId: z.string().uuid().nullable(),
});

export const startAccountDeletionJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => startSchema.parse(data))
  .handler(async ({ data, context }) => {
    const actorId = await assertSuperadmin(context as AuthContext);
    await assertNoActiveImpersonation(actorId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { startAccountDeletion, supabaseDeletionStore } = await import("@/lib/account-deletion.server");
    return startAccountDeletion(supabaseDeletionStore(supabaseAdmin), { actorId, ...data });
  });

export const getAccountDeletionJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ jobId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context as AuthContext);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job, error } = await supabaseAdmin
      .from("account_deletion_jobs")
      .select("id,kind,target_id,target_label,mode,reassign_to_user_id,status,phase,total,done,failed,report,errors,created_at,started_at,finished_at")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return job;
  });

export type DeletionPreview = {
  workload: Record<string, number>;
  images: number;
  /** Anunțuri de retras, pe portal (rânduri cu ID de portal sau publicări active). */
  withdrawals: { portal: string; count: number }[];
  /** La utilizator: ceilalți membri ai agenției; la agenție: toți membrii. */
  members: number;
  portalConnections: number;
  organizationId: string | null;
  organizationName: string | null;
};

/** Datele afișate în dialogurile de ștergere (utilizator sau agenție); doar citire. */
export const getDeletionPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ kind: z.enum(["user", "organization"]), targetId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<DeletionPreview> => {
    const actorId = await assertSuperadmin(context as AuthContext);
    await assertNoActiveImpersonation(actorId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const must = <T,>(r: { data: T; error: { message: string } | null }): T => {
      if (r.error) throw new Error(r.error.message);
      return r.data;
    };
    const isUser = data.kind === "user";
    let orgId: string | null = isUser ? null : data.targetId;
    let workload: Record<string, number> = {};
    if (isUser) {
      workload = (must(await supabaseAdmin.rpc("superadmin_user_workload", { _user: data.targetId, _actor: actorId })) ?? {}) as Record<string, number>;
      orgId = must(await supabaseAdmin.from("profiles").select("organization_id").eq("id", data.targetId).maybeSingle())?.organization_id ?? null;
    } else {
      for (const t of ["properties", "leads", "contacts", "activities", "requests"] as const) {
        const r = await supabaseAdmin.from(t).select("id", { count: "exact", head: true }).eq("organization_id", data.targetId);
        if (r.error) throw new Error(r.error.message);
        workload[t] = r.count ?? 0;
      }
    }
    const col = isUser ? "assigned_to" : "organization_id";
    const props = (must(await supabaseAdmin.from("properties").select("id").eq(col, data.targetId)) ?? []).map((r) => r.id);
    let images = 0;
    const perPortal = new Map<string, Set<string>>();
    for (let i = 0; i < props.length; i += 200) {
      const chunk = props.slice(i, i + 200);
      const [img, listings, pubs] = await Promise.all([
        supabaseAdmin.from("property_images").select("id", { count: "exact", head: true }).in("property_id", chunk),
        supabaseAdmin.from("portal_listings").select("portal,property_id").in("property_id", chunk).not("external_id", "is", null),
        supabaseAdmin.from("portal_publications").select("portal_key,property_id").in("property_id", chunk).eq("enabled", true),
      ]);
      if (img.error) throw new Error(img.error.message);
      images += img.count ?? 0;
      const add = (portal: string, pid: string) => {
        if (!perPortal.has(portal)) perPortal.set(portal, new Set());
        perPortal.get(portal)!.add(pid);
      };
      for (const r of must(listings) ?? []) add(r.portal, r.property_id);
      for (const r of must(pubs) ?? []) add(r.portal_key, r.property_id);
    }
    let members = 0;
    let portalConnections = 0;
    let organizationName: string | null = null;
    if (orgId) {
      let mq = supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("organization_id", orgId);
      if (isUser) mq = mq.neq("id", data.targetId);
      const r = await mq;
      if (r.error) throw new Error(r.error.message);
      members = r.count ?? 0;
      organizationName = must(await supabaseAdmin.from("organizations").select("name").eq("id", orgId).maybeSingle())?.name ?? null;
      if (!isUser) {
        const c = await supabaseAdmin.from("portal_connections").select("id", { count: "exact", head: true }).eq("organization_id", orgId);
        if (c.error) throw new Error(c.error.message);
        portalConnections = c.count ?? 0;
      }
    }
    return {
      workload,
      images,
      withdrawals: [...perPortal.entries()].map(([portal, set]) => ({ portal, count: set.size })),
      members,
      portalConnections,
      organizationId: orgId,
      organizationName,
    };
  });

/** Agențiile care au cel puțin un superadmin (nu se pot șterge). */
export const listSuperadminOrganizationIds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<string[]> => {
    await assertSuperadmin(context as AuthContext);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const roles = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "superadmin");
    if (roles.error) throw new Error(roles.error.message);
    const ids = (roles.data ?? []).map((r) => r.user_id);
    if (!ids.length) return [];
    const p = await supabaseAdmin.from("profiles").select("organization_id").in("id", ids);
    if (p.error) throw new Error(p.error.message);
    return [...new Set((p.data ?? []).map((r) => r.organization_id).filter((x): x is string => Boolean(x)))];
  });
