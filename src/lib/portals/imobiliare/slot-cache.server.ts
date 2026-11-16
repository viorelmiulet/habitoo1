/**
 * One invalidation point for every per-isolate cache that shows Imobiliare.ro capacity:
 * the 10-minute `/me` memo and the promotion usage/inventory cache. Called after
 * withdraw, delete, any publication outcome and slot refusals.
 */
import { invalidateImobiliareAccountCache } from "./account.server";

export async function invalidateImobiliareSlotCaches(organizationId: string): Promise<void> {
  invalidateImobiliareAccountCache(organizationId);
  try {
    const { invalidatePromotionUsageCache } = await import("../promotions/allocation.server");
    invalidatePromotionUsageCache(organizationId);
  } catch {
    // Cache invalidation never fails a portal operation.
  }
}
