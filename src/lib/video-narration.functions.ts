import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { NarrationItem } from "./video-narration";

type Result = { ok: true; item: NarrationItem } | { ok: false; message: string };
export const startVideoNarration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ propertyId: z.string().uuid(), requestKey: z.string().uuid(), text: z.string().max(4000), voice: z.enum(["female", "male"]), seconds: z.number().min(6).max(60) }).parse(input))
  .handler(async ({ data, context }): Promise<Result> => {
    try {
      const { startNarrationCore } = await import("./video-narration.server");
      return { ok: true, item: await startNarrationCore(context.supabase, context.userId, data) };
    } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Generarea vocii a eșuat." }; }
  });
export const refreshVideoNarration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ propertyId: z.string().uuid(), id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<Result> => {
    try {
      const { refreshNarrationCore } = await import("./video-narration.server");
      return { ok: true, item: await refreshNarrationCore(context.supabase, context.userId, data.propertyId, data.id) };
    } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Vocea nu a putut fi încărcată." }; }
  });