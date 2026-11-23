import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import type { PhotoReview } from "./photo-review";
import type { AiProviderAttachment } from "@/lib/ai/providers/types";

export const reviewListingPhotos = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ propertyId: z.string().uuid(), imageIds: z.array(z.string().uuid()).min(1).max(20) }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true; review: PhotoReview } | { ok: false; message: string }> => {
    const { runListingChecks } = await import("@/lib/listing-check/check.server");
    const [allowed] = await runListingChecks(context.supabase as never, context.userId, [data.propertyId]);
    if (!allowed) return { ok: false, message: "Anunțul nu este accesibil." };
    const { data: property } = await context.supabase.from("properties").select("organization_id").eq("id", data.propertyId).maybeSingle();
    if (!property) return { ok: false, message: "Anunțul nu este accesibil." };
    const { isAiFeatureEnabled } = await import("@/lib/ai/features/features.server");
    if (!(await isAiFeatureEnabled(property.organization_id, "ai_listing_autofill"))) return { ok: false, message: "Funcțiile AI nu sunt activate pentru agenție." };
    const { data: images, error } = await context.supabase.from("property_images").select("id,storage_path").eq("organization_id", property.organization_id).eq("property_id", data.propertyId).in("id", data.imageIds).eq("is_confidential", false);
    if (error || !images || images.length !== new Set(data.imageIds).size) return { ok: false, message: "Fotografiile nu mai sunt disponibile. Reîncarcă galeria." };
    const { resolveAiProvider } = await import("@/lib/ai/providers/registry.server");
    const provider = resolveAiProvider("standard");
    if (!provider) return { ok: false, message: "Serviciul AI nu este configurat momentan." };
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const attachments: AiProviderAttachment[] = [];
      for (const id of data.imageIds) {
        const image = images.find((i) => i.id === id);
        if (!image?.storage_path) throw new Error("Fotografie indisponibilă.");
        const signed = await context.supabase.storage.from("property-media").createSignedUrl(image.storage_path, 60, { transform: { width: 1024, height: 1024, resize: "contain", quality: 75 } });
        if (!signed.data?.signedUrl) throw new Error("Fotografie indisponibilă.");
        const response = await fetch(signed.data.signedUrl, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error("Fotografie indisponibilă.");
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length > 1500000) throw new Error("Fotografie prea mare.");
        attachments.push({ mimeType: response.headers.get("content-type")?.split(";")[0] ?? "image/jpeg", base64: Buffer.from(bytes).toString("base64"), detail: "high" as const });
      }
      const started = Date.now();
      const { chargedAiFallback } = await import("@/lib/ai/credits/credits.server");
      const { generatePhotoReview } = await import("./photo-review.server");
      const completed = await chargedAiFallback({ organizationId: property.organization_id, userId: context.userId }, "standard", provider, (selected) => generatePhotoReview(selected, data.imageIds, attachments));
      const { writeAiUsage } = await import("@/lib/ai/usage/tracking.server");
      await writeAiUsage(supabaseAdmin as never, { organization_id: property.organization_id, user_id: context.userId, provider: completed.provider.id, model: completed.provider.model, capability: "listing_photo_review", input_tokens: completed.result.generated.inputTokens, output_tokens: completed.result.generated.outputTokens, latency_ms: Date.now() - started, success: true, tool_calls: 0, fallback_used: completed.fallbackUsed });
      return { ok: true, review: completed.result.review };
    } catch (error) {
      const { safeAiProviderMessage } = await import("@/lib/ai/providers/types");
      return { ok: false, message: safeAiProviderMessage(error) };
    }
  });