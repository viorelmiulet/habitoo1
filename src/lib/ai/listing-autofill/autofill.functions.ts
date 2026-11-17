import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  AUTOFILL_EMPTY_MESSAGE,
  AUTOFILL_INVALID_MESSAGE,
  AUTOFILL_MAX_PHOTOS,
} from "./schema";
import type { AutofillResult } from "./autofill.server";

const base64 = z.string().regex(/^[A-Za-z0-9+/=]+$/);
const inputSchema = z.object({
  images: z.array(z.object({ mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]), base64: base64.max(1_500_000) })).max(AUTOFILL_MAX_PHOTOS),
  text: z.string().max(4000),
  context: z.object({
    title: z.string().max(500).optional(),
    description: z.string().max(20000).optional(),
    known: z.record(z.string(), z.union([z.string().max(500), z.number(), z.boolean(), z.array(z.string().max(200)).max(60), z.null()])).optional(),
    location: z.object({
      propertyId: z.string().uuid().optional(), address: z.string().max(500).optional(), city: z.string().max(200).optional(),
      street: z.string().max(300).optional(), streetNumber: z.string().max(50).optional(), residentialComplex: z.string().max(300).optional(),
      lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional(), localitySirutaCode: z.number().int().optional(),
    }).optional(),
  }).optional(),
});

/** Completează formularul proprietății din poze și text. Nu scrie nimic în proprietate. */
export const autofillListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }): Promise<AutofillResult> => {
    if (data.images.length === 0 && !data.text.trim() && !data.context?.description?.trim() && !data.context?.title?.trim()) return { ok: false, message: AUTOFILL_EMPTY_MESSAGE };

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
    const { loadAutofillHistory } = await import("./history.server");
    const historyController = new AbortController();
    let historyTimer: ReturnType<typeof setTimeout> | undefined;
    const historyDeadline = new Promise<never>((_, reject) => {
      historyTimer = setTimeout(() => { reject(new Error("History timeout")); historyController.abort(); }, 1500);
    });
    const enrichment = await Promise.race([loadAutofillHistory(context.supabase, organizationId, data.context?.location, historyController.signal), historyDeadline]).catch(() => {
      console.error("[ai_listing_autofill] history unavailable");
      return { history: { values: {}, confidence: {} }, urban: false };
    }).finally(() => { if (historyTimer !== undefined) clearTimeout(historyTimer); });
    return executeListingAutofill({ organizationId, userId: context.userId }, provider, {
      images: data.images,
      text: data.text,
      context: data.context,
      ...enrichment,
    }).catch(async (error: unknown) => {
      console.error("[ai_listing_autofill] failed", error instanceof Error ? error.name : "error");
      const { autofillFailureMessage } = await import("./charge.server");
      return { ok: false as const, message: error instanceof Error && error.name === "AiCreditsExhaustedError" ? error.message : autofillFailureMessage(error) };
    });
  });
