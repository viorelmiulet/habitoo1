/**
 * Ștergerea „soft” a anunțurilor. Drepturile se verifică în RPC-ul
 * `delete_property` (baza de date); aici doar se pun în coadă retragerile de
 * pe portaluri, cu motivul `deleted`. Restabilirea: RPC `restore_property`,
 * doar pentru superadmin, fără republicare automată.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import type { StatusWithdrawAdmin, EnqueueDeps } from "@/lib/portals/status-withdraw.server";

type RpcClient = { rpc: (name: string, params?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

/** Logica comună (testabilă): RPC-ul ca utilizator, apoi coada de retrageri. */
export async function deletePropertyCore(
  userClient: RpcClient,
  admin: StatusWithdrawAdmin,
  input: { propertyId: string; actorId: string },
  deps: EnqueueDeps & {
    enqueue: typeof import("@/lib/portals/status-withdraw.server").enqueueStatusWithdrawals;
  },
) {
  const { data, error } = await userClient.rpc("delete_property", { _id: input.propertyId });
  if (error) throw new Error(error.message);
  const organizationId = String(data);
  let queued = 0;
  let manual = 0;
  try {
    const out = await deps.enqueue(
      admin,
      { organizationId, propertyIds: [input.propertyId], reason: "deleted", actorId: input.actorId },
      { logOperation: deps.logOperation },
    );
    queued = out.queued.length;
    manual = out.manual.length;
  } catch (e) {
    // Anunțul rămâne șters; feedurile îl exclud oricum.
    console.error("delete withdraw enqueue failed", e);
  }
  return { ok: true as const, organizationId, queued, manual };
}

export const deleteProperty = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as { userId: string; supabase: RpcClient };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enqueueStatusWithdrawals } = await import("@/lib/portals/status-withdraw.server");
    const { logOperation } = await import("@/lib/portals.functions");
    const { clearProperstarCache } = await import("@/lib/portals/properstar/cache");
    const out = await deletePropertyCore(
      ctx.supabase,
      supabaseAdmin as never,
      { propertyId: data.propertyId, actorId: ctx.userId },
      { enqueue: enqueueStatusWithdrawals, logOperation: async (i) => void (await logOperation(i)) },
    );
    clearProperstarCache(out.organizationId);
    return out;
  });
