import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TextCorrectionResult } from "./text";

export const correctListingText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ field: z.enum(["title", "description"]), text: z.string().min(1).max(20000) }).parse(input))
  .handler(async ({ data, context }): Promise<TextCorrectionResult> => {
    const { data: profile } = await context.supabase.from("profiles").select("organization_id").eq("id", context.userId).maybeSingle();
    const organizationId = profile?.organization_id;
    const { isAiFeatureEnabled } = await import("@/lib/ai/features/features.server");
    if (!organizationId || !(await isAiFeatureEnabled(organizationId, "ai_marketing"))) {
      const { aiFeatureDisabledMessage } = await import("@/lib/ai/features/keys");
      return { ok: false, message: aiFeatureDisabledMessage("ai_marketing") };
    }
    const { resolveAiProvider } = await import("@/lib/ai/providers/registry.server");
    const { executeTextCorrection } = await import("./correction.server");
    return executeTextCorrection({ organizationId, userId: context.userId }, resolveAiProvider("fast"), data.text, data.field);
  });