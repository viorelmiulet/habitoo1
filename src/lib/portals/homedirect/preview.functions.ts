/**
 * HomeDirect.ro: previzualizarea corpurilor `CreatePropertyRequest` (doar SuperAdmin).
 * Rezolvă locația (cache sau API, dacă cheia există) și rulează mapperul. Nu creează nimic la HomeDirect.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const previewHomedirectPayload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { propertyId: string }) => z.object({ propertyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isSuper } = await (context.supabase as any).rpc("is_superadmin");
    if (isSuper !== true) throw new Error("Acces refuzat: doar SuperAdmin.");
    const { buildHomedirectPreview } = await import("./preview.server");
    const r = await buildHomedirectPreview(data.propertyId);
    return { ...r, bodiesJson: r.bodies.length ? JSON.stringify(r.bodies, null, 2) : null };
  });
