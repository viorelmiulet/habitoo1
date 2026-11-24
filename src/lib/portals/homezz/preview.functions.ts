import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const previewHomezzPayload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { organizationId?: string; propertyId: string }) =>
    z.object({ organizationId: z.string().uuid().optional(), propertyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc("is_superadmin");
    if (allowed !== true) throw new Error("Acces refuzat: doar SuperAdmin.");
    const { buildHomezzPreview } = await import("./preview.server");
    return JSON.parse(JSON.stringify(await buildHomezzPreview(data.organizationId ?? null, data.propertyId)));
  });
