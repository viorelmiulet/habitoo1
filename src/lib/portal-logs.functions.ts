import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { portalLogsFilterSchema } from "@/lib/portals/operation-logs";
import { listPortalLogOperations, queryPortalLogs } from "@/lib/portal-logs.server";

type Ctx = { supabase: { rpc: (fn: string) => PromiseLike<{ data: unknown; error: unknown }> } };

export const PORTAL_LOGS_DENIED = "Acces refuzat: jurnalul portalurilor este disponibil doar pentru Superadmin.";

export async function assertSuperadmin(context: Ctx): Promise<void> {
  const { data, error } = await context.supabase.rpc("is_superadmin");
  if (error || data !== true) throw new Error(PORTAL_LOGS_DENIED);
}

/** Jurnalul operațiilor cu portalurile, toate agențiile. Doar citire, doar Superadmin. */
export const getPortalOperationLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => portalLogsFilterSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context as unknown as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [page, operations] = await Promise.all([
      queryPortalLogs(supabaseAdmin, data),
      listPortalLogOperations(supabaseAdmin),
    ]);
    return { ...page, rows: page.rows.map((r) => ({ ...r, portalResponse: JSON.stringify(r.portalResponse) })), operations };
  });
