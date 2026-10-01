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

export type UserDeletionPreview = {
  workload: Record<string, number>;
  images: number;
  /** Anunțuri de retras, pe portal (rânduri cu ID de portal sau publicări active). */
  withdrawals: { portal: string; count: number }[];
  otherMembers: number;
  organizationName: string | null;
};

/** Datele afișate în dialogul „Șterge utilizatorul”; doar citire. */
export const getUserDeletionPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<UserDeletionPreview> => {
    const actorId = await assertSuperadmin(context as AuthContext);
    await assertNoActiveImpersonation(actorId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const must = <T,>(r: { data: T; error: { message: string } | null }): T => {
      if (r.error) throw new Error(r.error.message);
      return r.data;
    };
    const workload = (must(await supabaseAdmin.rpc("superadmin_user_workload", { _user: data.userId, _actor: actorId })) ?? {}) as Record<string, number>;
    const profile = must(await supabaseAdmin.from("profiles").select("organization_id").eq("id", data.userId).maybeSingle());
    const orgId = profile?.organization_id ?? null;
    const props = (must(await supabaseAdmin.from("properties").select("id").eq("assigned_to", data.userId)) ?? []).map((r) => r.id);
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
    let otherMembers = 0;
    let organizationName: string | null = null;
    if (orgId) {
      const r = await supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("organization_id", orgId).neq("id", data.userId);
      if (r.error) throw new Error(r.error.message);
      otherMembers = r.count ?? 0;
      organizationName = must(await supabaseAdmin.from("organizations").select("name").eq("id", orgId).maybeSingle())?.name ?? null;
    }
    return {
      workload,
      images,
      withdrawals: [...perPortal.entries()].map(([portal, set]) => ({ portal, count: set.size })),
      otherMembers,
      organizationName,
    };
  });
