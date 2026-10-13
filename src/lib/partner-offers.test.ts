import { describe, expect, it } from "vitest";
import { PARTNER_OFFERS_PAGE_SIZE, PARTNER_OFFER_SORTS, nextPartnerOfferOffset, parsePartnerOfferView, partnerOfferViewKey } from "./partner-offers";

describe("partner offer display rules", () => {
  it("loads 24 offers progressively without imposing a total cap", () => {
    expect(PARTNER_OFFERS_PAGE_SIZE).toBe(24);
    expect(nextPartnerOfferOffset(24, 73)).toBe(24);
    expect(nextPartnerOfferOffset(48, 73)).toBe(48);
    expect(nextPartnerOfferOffset(72, 73)).toBe(72);
    expect(nextPartnerOfferOffset(73, 73)).toBeUndefined();
  });
  it("keeps display preferences separate for each user", () => {
    expect(partnerOfferViewKey("agent-a")).not.toBe(partnerOfferViewKey("agent-b"));
    expect(parsePartnerOfferView("list")).toBe("list");
    expect(parsePartnerOfferView(null)).toBe("cards");
  });
  it("sorts newest by creation date, prices both ways and commission descending", () => {
    expect(PARTNER_OFFER_SORTS.newest).toEqual({ column: "created_at", ascending: false });
    expect(PARTNER_OFFER_SORTS["price-asc"]).toEqual({ column: "price", ascending: true });
    expect(PARTNER_OFFER_SORTS["price-desc"]).toEqual({ column: "price", ascending: false });
    expect(PARTNER_OFFER_SORTS["commission-desc"]).toEqual({ column: "collab_commission_percent", ascending: false });
  });
});