import { beforeEach, describe, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({ writes: [] as unknown[], logs: [] as Record<string, unknown>[], local: [] as { promotion_id: string; value_boolean: boolean; value_numeric: null }[], reject: false }));
vi.mock("@/lib/portals/imobiliare-promotions.functions", () => ({ prepare: async () => ({ ok: true, reference: "HB-TEST", session: {}, admin: { from: () => {
  const chain = { select: () => chain, eq: () => chain, then: (resolve: (value: unknown) => unknown) => resolve({ data: calls.local }) };
  return chain;
} } }) }));
vi.mock("@/lib/portals.functions", () => ({ logOperation: async (input: Record<string, unknown>) => { calls.logs.push(input); } }));
vi.mock("../promotions.server", () => ({
  fetchImobiliareListingPromotions: async () => ({ states: new Map(), error: null }),
  fetchImobiliareSlotMembership: async () => null,
  setImobiliareListingPromotion: async (input: { definition: { writeField: string }; value: unknown; allocation: unknown }) => {
    calls.writes.push({ promotions: { [input.definition.writeField]: input.value }, allocation: input.allocation });
    return calls.reject ? { ok: false, code: "PROMOTION_WARNING", message: "Top Listing: locurile s-au ocupat", httpStatus: 200 } : { ok: true, value: input.value, httpStatus: 200, portalResponse: {} };
  },
}));
vi.mock("@/lib/portals/promotions/allocation.server", () => ({ invalidatePromotionUsageCache: () => undefined }));
import { applyImobiliareCardPromotions } from "../card-promotions.server";
beforeEach(() => { calls.writes.length = 0; calls.logs.length = 0; calls.local.length = 0; calls.reject = false; });
const base = { organizationId: "org", propertyId: "property", actorId: "actor" };
describe("card promotion server contract", () => {
  it("uses the existing allocation gate and Top Listing field", async () => {
    expect(await applyImobiliareCardPromotions({ ...base, changes: { tl: true } })).toEqual([]);
    expect(calls.writes).toEqual([{ promotions: { top_listing: true }, allocation: { propertyId: "property" } }]);
  });
  it("only stops Bonus, without touching other services", async () => {
    calls.local.push({ promotion_id: "bonus", value_boolean: true, value_numeric: null });
    await applyImobiliareCardPromotions({ ...base, changes: { bonus: false } });
    expect(calls.writes).toEqual([{ promotions: { bonus: false }, allocation: { propertyId: "property" } }]);
  });
  it("recovered job does not resend an already confirmed service", async () => {
    calls.local.push({ promotion_id: "tl", value_boolean: true, value_numeric: null });
    expect(await applyImobiliareCardPromotions({ ...base, changes: { tl: true } })).toEqual([]);
    expect(calls.writes).toEqual([]);
  });
  it("records exact rejection per service with elapsed duration", async () => {
    calls.reject = true;
    expect(await applyImobiliareCardPromotions({ ...base, changes: { tl: true } })).toEqual([{ promotionId: "tl", message: "Top Listing: locurile s-au ocupat" }]);
    expect(calls.logs[0]).toMatchObject({ operation: "promotion:tl:on", success: false, errorMessage: "Top Listing: locurile s-au ocupat", actorId: "actor" });
    expect(calls.logs[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });
});