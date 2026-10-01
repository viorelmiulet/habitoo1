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
