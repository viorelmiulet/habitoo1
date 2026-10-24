import { describe, expect, it, vi } from "vitest";
import { imobiliareDestinationStatus, imobiliarePortalDecidesSlots, imobiliarePromotionChanges, imobiliarePromotionControlBlocked, imobiliarePromotionChangesSchema, runImobiliarePromotionChanges } from "../card-promotions";
import { imobiliarePromotion, imobiliarePromotionPatch } from "../promotions";

describe("promotion choices on the portal card", () => {
  it("deselection drafts both destinations", () => {
    expect(imobiliareDestinationStatus("imoradar_only", false)).toEqual({ status: "draft", imoradar_status: "draft" });
    expect(imobiliareDestinationStatus("combined", false)).toEqual({ status: "draft", imoradar_status: "draft" });
  });
  it("only Bonus and imoradar-only bypass publication capacity locally", () => {
    expect(imobiliarePortalDecidesSlots("imobiliare_ro", "imoradar_only")).toBe(true);
    expect(imobiliarePortalDecidesSlots("imobiliare_ro", "combined", { bonus: true })).toBe(true);
    expect(imobiliarePortalDecidesSlots("imobiliare_ro", "combined", { tl: true })).toBe(false);
    expect(imobiliarePortalDecidesSlots("storia", "imoradar_only", { bonus: true })).toBe(false);
  });
  it("Bonus stays selectable without inventory or remaining capacity", () => {
    expect(imobiliarePromotionControlBlocked({ id: "bonus", manageable: true, value: false, slotType: "bonus", available: null, remaining: 0, agencyRemaining: 0, error: "Locuri necunoscute" })).toBe(false);
  });
  it("new publication includes the selected Top Listing", () => {
    expect(imobiliarePromotionChanges([{ id: "tl", value: false }, { id: "bonus", value: false }], { tl: true }, false)).toEqual({ tl: true });
    const definition = imobiliarePromotion("tl");
    if (!definition) throw new Error("Missing Top Listing");
    expect(imobiliarePromotionPatch(definition, true)).toEqual({ promotions: { top_listing: true } });
  });
  it("disables Top Listing when no slots are free, even with unknown listing state", () => {
    expect(imobiliarePromotionControlBlocked({ manageable: true, value: null, slotType: "tl", available: 0, remaining: null, error: null })).toBe(true);
  });
  it("keeps stopping an active promotion possible with exhausted slots", () => {
    expect(imobiliarePromotionControlBlocked({ manageable: true, value: true, slotType: "tl", available: 0, remaining: 0, agencyRemaining: 0, error: null })).toBe(false);
  });
  it("blocks activation at the agent allocation limit", () => {
    expect(imobiliarePromotionControlBlocked({ manageable: true, value: false, slotType: "tl", available: 3, remaining: 0, error: null })).toBe(true);
  });
  it("blocks activation at the agency ceiling", () => {
    expect(imobiliarePromotionControlBlocked({ manageable: true, value: false, slotType: "tl", available: 3, remaining: null, agencyRemaining: 0, error: null })).toBe(true);
  });
  it("unchecking Bonus only sends bonus false", () => {
    const changes = imobiliarePromotionChanges([{ id: "bonus", value: true }, { id: "tl", value: true }], { bonus: false }, true);
    expect(changes).toEqual({ bonus: false });
    const definition = imobiliarePromotion("bonus");
    if (!definition) throw new Error("Missing Bonus");
    expect(imobiliarePromotionPatch(definition, changes.bonus ?? true)).toEqual({ promotions: { bonus: false } });
  });
  it("republishing and updating do not resend unchanged promotions", () => {
    expect(imobiliarePromotionChanges([{ id: "tl", value: true }, { id: "energy", value: 10 }], {}, true)).toEqual({});
    expect(imobiliarePromotionChanges([{ id: "tl", value: true }], { tl: true }, true)).toEqual({});
  });
  it("retains the exact rejection and continues other promotions", async () => {
    const apply = vi.fn().mockResolvedValueOnce({ ok: false, message: "Top Listing: toate locurile sunt ocupate" }).mockResolvedValueOnce({ ok: true, message: "OK" });
    expect(await runImobiliarePromotionChanges({ tl: true, bonus: true }, apply)).toEqual([{ promotionId: "tl", message: "Top Listing: toate locurile sunt ocupate" }]);
    expect(apply.mock.calls).toEqual([["tl", true], ["bonus", true]]);
  });
  it("rejects unsupported services and numeric booleans", () => {
    expect(imobiliarePromotionChangesSchema.safeParse({ starter: true }).success).toBe(false);
    expect(imobiliarePromotionChangesSchema.safeParse({ energy: true }).success).toBe(false);
    expect(imobiliarePromotionChangesSchema.safeParse({ bonus: 1 }).success).toBe(false);
    expect(imobiliarePromotionChangesSchema.safeParse({ tl: true, energy: 3 }).success).toBe(true);
  });
});