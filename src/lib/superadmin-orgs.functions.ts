// Operațiuni administrative pe agenții, disponibile exclusiv superadminului.
// Rolul este re-verificat pe server (RPC acoperit de RLS) și încă o dată în funcția SQL
// `superadmin_delete_organization`, care rulează totul într-o singură tranzacție.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { deleteOrganizationInput } from "@/lib/user-deletion";

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

/**
 * Ștergerea definitivă a unei agenții trece prin jobul `account_deletion_jobs`
 * (retragere de pe portaluri, curățarea storage-ului, apoi rândurile și conturile).
 */
export const deleteOrganizationPermanently = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => deleteOrganizationInput.parse(data))
  .handler(async ({ data, context }) => {
    const actorId = await assertSuperadmin(context as AuthContext);
    const { assertNoActiveImpersonation } = await import("@/lib/impersonation.functions");
    await assertNoActiveImpersonation(actorId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { startAccountDeletion, supabaseDeletionStore } = await import("@/lib/account-deletion.server");
    return startAccountDeletion(supabaseDeletionStore(supabaseAdmin), {
      actorId,
      kind: "organization",
      targetId: data.organizationId,
      mode: data.mode,
      reassignToUserId: data.mode === "reassign" ? data.reassignToUserId : null,
    });
  });
