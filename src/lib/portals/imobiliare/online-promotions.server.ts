import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ImobiliareSession } from "./auth.server";
import { imobiliareAuthedRequest } from "./auth.server";
import { promotionsPath } from "./config";
import { imobiliarePromotion, imobiliarePromotionPatch } from "./promotions";
import { imobiliareDestinationStatus, imobiliarePromotionChangesSchema, type ImobiliarePromotionChanges, type ImobiliarePublicationMode } from "./card-promotions";
import { confirmImobiliareListingPromotion, fetchImobiliareListingPromotions, fetchImobiliareSlotMembership, validateImobiliareListingPromotion, type PromotionWriteInput } from "./promotions.server";
import { mergeImobiliarePromotionState } from "./promotions";
import { warningsForImobiliareService } from "./online-promotions";

/** Called inside the listing's existing durable lock; never takes a nested lock. */
export async function publishImobiliareOnline(input: {
  admin: SupabaseClient<Database>; session: ImobiliareSession; organizationId: string;
  propertyId: string; reference: string; actorId: string | null; changes: ImobiliarePromotionChanges;
  mode?: ImobiliarePublicationMode;
}) {
  const changes = imobiliarePromotionChangesSchema.parse(input.mode === "imoradar_only" ? {} : input.changes);
  const entries: PromotionWriteInput[] = [];
  const promotions: Record<string, boolean | number> = {};
  if (Object.keys(changes).length) {
    const [listing, local] = await Promise.all([
      fetchImobiliareListingPromotions(input),
      input.admin.from("imobiliare_promotion_states").select("promotion_id, value_boolean, value_numeric")
        .eq("organization_id", input.organizationId).eq("property_id", input.propertyId),
    ]);
    for (const [id, value] of Object.entries(changes)) {
      const definition = imobiliarePromotion(id);
      if (!definition?.writeField) continue;
      const membership = id !== "bonus" && definition.slotType && definition.kind === "boolean"
        ? await fetchImobiliareSlotMembership({ ...input, slotType: definition.slotType }) : null;
      const saved = local.data?.find(row => row.promotion_id === id);
      const current = mergeImobiliarePromotionState({ fromListing: listing.states.get(id) ?? null,
        fromSlotList: membership, fromLocal: saved?.value_numeric ?? saved?.value_boolean ?? null }).value;
      const entry: PromotionWriteInput = { ...input, definition, value, current,
        allocation: { propertyId: input.propertyId, ...(id === "promote_imoradar" ? { skipRules: true } : {}) } };
      const allowed = await validateImobiliareListingPromotion(entry);
      if (!allowed.ok) return { ok: false as const, message: allowed.message, status: 422, body: null, classification: { code: allowed.code, message: allowed.message } };
      entries.push(entry);
      Object.assign(promotions, imobiliarePromotionPatch(definition, value).promotions);
    }
  }
  const started = Date.now();
  const response = await imobiliareAuthedRequest(input.session, {
    method: "POST", path: promotionsPath(input.reference), connectionKey: input.organizationId,
    body: { ...imobiliareDestinationStatus(input.mode), ...(entries.length ? { promotions } : {}) },
  });
  const promotionErrors: { promotionId: string; message: string }[] = [];
  if (response.ok && entries.length) {
    const { logOperation } = await import("@/lib/portals.functions");
    const { invalidatePromotionUsageCache } = await import("../promotions/allocation.server");
    for (const entry of entries) {
      const result = await confirmImobiliareListingPromotion(entry, response, warningsForImobiliareService(response.body, entry.definition));
      await logOperation({ organizationId: input.organizationId, propertyId: input.propertyId, actorId: input.actorId,
        portal: "imobiliare_ro", externalId: input.reference,
        operation: `promotion:${entry.definition.id}:${typeof entry.value === "number" ? entry.value : entry.value ? "on" : "off"}`,
        success: result.ok, httpStatus: response.status, portalResponse: response.body, durationMs: Date.now() - started,
        ...(result.ok ? (result.warnings?.length ? { errorCode: "PROMOTION_WARNING", errorMessage: result.warnings.join(" ") } : {})
          : { errorCode: result.code, errorMessage: result.message }),
      }).catch(() => undefined);
      if (result.ok) invalidatePromotionUsageCache(input.organizationId, entry.definition.id);
      else promotionErrors.push({ promotionId: entry.definition.id, message: result.message });
    }
  }
  return { ...response, promotionErrors };
}