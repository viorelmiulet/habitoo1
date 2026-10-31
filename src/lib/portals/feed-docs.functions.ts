import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** PDF-ul documentației feedului, cu URL-ul indexului. Doar SuperAdmin; descărcarea intră în audit, fără cheie. */
export const downloadFeedDocumentation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ portal: z.string().min(1).max(40), organizationId: z.string().uuid().nullable() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { buildFeedDocDownload } = await import("@/lib/portals/feed-docs.server");
    const ctx = context as unknown as {
      userId: string;
      supabase: { rpc: (fn: string) => PromiseLike<{ data: unknown; error: unknown }> };
    };
    const result = await buildFeedDocDownload(data, {
      isSuperadmin: async () => {
        const { data: ok, error } = await ctx.supabase.rpc("is_superadmin");
        return !error && ok === true;
      },
      readKey: (name) => process.env[name],
      audit: async (row) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("audit_logs").insert({ ...row, actor_id: ctx.userId, created_by: ctx.userId } as never);
      },
    });
    if (!result.ok) {
      setResponseStatus(result.status);
      throw new Error(result.message);
    }
    return result;
  });
