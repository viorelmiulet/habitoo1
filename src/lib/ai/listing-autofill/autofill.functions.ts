import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  AUTOFILL_AUDIO_MIME,
  AUTOFILL_AUDIO_TOO_LONG_MESSAGE,
  AUTOFILL_EMPTY_MESSAGE,
  AUTOFILL_INVALID_MESSAGE,
  AUTOFILL_MAX_AUDIO_SECONDS,
  AUTOFILL_MAX_PHOTOS,
} from "./schema";
import type { AutofillResult } from "./autofill.server";

const base64 = z.string().regex(/^[A-Za-z0-9+/=]+$/);
const inputSchema = z.object({
  images: z.array(z.object({ mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]), base64: base64.max(1_500_000) })).max(AUTOFILL_MAX_PHOTOS),
  audio: z.object({ mimeType: z.string(), base64: base64.max(4_000_000), durationSec: z.number().min(0) }).nullable(),
  text: z.string().max(4000),
});

/** Completează formularul proprietății din poze și voce. Nu scrie nimic în proprietate. */
export const autofillListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }): Promise<AutofillResult> => {
    if (data.audio && data.audio.durationSec > AUTOFILL_MAX_AUDIO_SECONDS + 1) return { ok: false, message: AUTOFILL_AUDIO_TOO_LONG_MESSAGE };
    const audioMime = data.audio?.mimeType.split(";")[0]!.trim().toLowerCase() ?? null;
    if (audioMime && !(AUTOFILL_AUDIO_MIME as readonly string[]).includes(audioMime)) return { ok: false, message: "Formatul înregistrării nu este acceptat (webm, ogg sau m4a)." };
    if (data.images.length === 0 && !data.audio && !data.text.trim()) return { ok: false, message: AUTOFILL_EMPTY_MESSAGE };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin.from("profiles").select("organization_id").eq("id", context.userId).maybeSingle();
    const organizationId = profile?.organization_id ?? null;
    const { isAiFeatureEnabled } = await import("@/lib/ai/features/features.server");
    if (!organizationId || !(await isAiFeatureEnabled(organizationId, "ai_listing_autofill"))) {
      const { aiFeatureDisabledMessage } = await import("@/lib/ai/features/keys");
      return { ok: false, message: aiFeatureDisabledMessage("ai_listing_autofill") };
    }
    const { resolveAiProvider } = await import("@/lib/ai/providers/registry.server");
    const provider = resolveAiProvider("standard");
    if (!provider) return { ok: false, message: "Serviciul AI nu este configurat momentan." };

    const { executeListingAutofill } = await import("./charge.server");
    return executeListingAutofill({ organizationId, userId: context.userId }, provider, {
      images: data.images,
      audio: data.audio && audioMime ? { mimeType: audioMime === "audio/x-m4a" || audioMime === "audio/m4a" ? "audio/mp4" : audioMime, base64: data.audio.base64 } : null,
      text: data.text,
    }).catch((error: unknown) => {
      console.error("[ai_listing_autofill] failed", error instanceof Error ? error.name : "error");
      return { ok: false as const, message: error instanceof Error && error.name === "AiCreditsExhaustedError" ? error.message : AUTOFILL_INVALID_MESSAGE };
    });
  });
