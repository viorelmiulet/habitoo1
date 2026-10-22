import type { ImobiliarePromotionChanges } from "./card-promotions";
import { runImobiliarePromotionChanges } from "./card-promotions";
import { imobiliarePromotion, mergeImobiliarePromotionState } from "./promotions";
import { fetchImobiliareListingPromotions, fetchImobiliareSlotMembership, setImobiliareListingPromotion } from "./promotions.server";

export async function applyImobiliareCardPromotions(input: { organizationId: string; propertyId: string; actorId: string | null; changes: ImobiliarePromotionChanges }) {
  const { prepare } = await import("../imobiliare-promotions.functions");
  const { logOperation } = await import("@/lib/portals.functions");
  const prepared = await prepare(input.organizationId, input.propertyId);
  if (!prepared.ok) {
    const errors = Object.keys(input.changes).map((promotionId) => ({ promotionId, message: prepared.view.message ?? "Promovarea nu este disponibilă." }));
    for (const error of errors) await logOperation({ organizationId: input.organizationId, propertyId: input.propertyId, portal: "imobiliare_ro", actorId: input.actorId, operation: `promotion:${error.promotionId}:prepare`, success: false, errorCode: "PORTAL_ERROR", errorMessage: error.message, durationMs: 0 });
    return errors;
  }
  const [listing, local] = await Promise.all([
    fetchImobiliareListingPromotions({ session: prepared.session, organizationId: input.organizationId, reference: prepared.reference }),
    prepared.admin.from("imobiliare_promotion_states").select("promotion_id, value_boolean, value_numeric").eq("organization_id", input.organizationId).eq("property_id", input.propertyId),
  ]);
  return runImobiliarePromotionChanges(input.changes, async (id, value) => {
    const definition = imobiliarePromotion(id);
    if (!definition?.writeField) return { ok: false, message: "Serviciu de promovare necunoscut." };
    const membership = definition.slotType && definition.kind === "boolean"
      ? await fetchImobiliareSlotMembership({ session: prepared.session, organizationId: input.organizationId, reference: prepared.reference, slotType: definition.slotType }) : null;
    const saved = local.data?.find((row) => row.promotion_id === id);
    const current = mergeImobiliarePromotionState({ fromListing: listing.states.get(id) ?? null, fromSlotList: membership, fromLocal: saved?.value_numeric ?? saved?.value_boolean ?? null }).value;
    // Recovered/retried jobs must not consume a slot twice.
    if (current === value) return { ok: true, message: "Neschimbat." };
    const started = Date.now();
    const result = await setImobiliareListingPromotion({ admin: prepared.admin, session: prepared.session, organizationId: input.organizationId, reference: prepared.reference, definition, value, current, allocation: { propertyId: input.propertyId, ...(id === "promote_imoradar" ? { skipRules: true } : {}) } });
    await logOperation({ organizationId: input.organizationId, propertyId: input.propertyId, portal: "imobiliare_ro", actorId: input.actorId, externalId: prepared.reference, operation: `promotion:${id}:${typeof value === "number" ? value : value ? "on" : "off"}`, success: result.ok, durationMs: Date.now() - started,
      httpStatus: result.httpStatus ?? null, portalResponse: result.portalResponse ?? null,
      ...(result.ok ? (result.warnings?.length ? { errorCode: "PROMOTION_WARNING", errorMessage: result.warnings.join(" ") } : {}) : { errorCode: result.code, errorMessage: result.message }),
    });
    if (result.ok) {
      const { invalidatePromotionUsageCache } = await import("../promotions/allocation.server");
      invalidatePromotionUsageCache(input.organizationId, id);
    }
    return { ok: result.ok, message: result.ok ? "Promovare confirmată." : result.message };
  });
}