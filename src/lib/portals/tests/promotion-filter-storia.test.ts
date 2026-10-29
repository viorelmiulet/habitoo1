import { describe, expect, it } from "vitest";
import {
  parsePromotionSelection,
  promotionFilterGroups,
  propertyMatchesPromotion,
  storiaAutoRenewValues,
  type PropertyPromotionInfo,
} from "@/lib/portals/promotion-filter";
import { promotionFilterLabel } from "@/components/app/PromotionFilterSelect";

const empty: PropertyPromotionInfo = { imobiliarePublished: false, imobiliareActiveServices: [], flagPromotions: [] };

describe("Storia + OLX · Prelungire automată în filtrul Promovare", () => {
  it("grupa apare doar cu Storia activat", () => {
    expect(promotionFilterGroups(new Set(["imobiliare_ro"])).some((g) => g.portalId === "storia")).toBe(false);
    const group = promotionFilterGroups(new Set(["storia"])).find((g) => g.portalId === "storia");
    expect(group?.portalName).toBe("Storia + OLX");
    expect(group?.options.map((o) => o.value)).toEqual(["storia:auto_renew_on", "storia:auto_renew_off"]);
    expect(promotionFilterLabel("storia:auto_renew_on", [group!])).toBe("Storia · Prelungire automată activată");
  });

  it.each([
    [true, true, true], [true, false, true],
    [false, true, false], [false, false, false],
    [null, true, true], [null, false, false],
  ])("proprietate %s + agenție %s → %s", (own, agency, expected) => {
    const values = storiaAutoRenewValues({
      properties: [{ id: "p", storia_auto_renew: own }],
      selectedPropertyIds: ["p"], listings: [], agencyDefault: agency,
    });
    expect(values.get("p")).toBe(expected);
  });

  it("include anunțurile publicate/în procesare și exclude restul", () => {
    const values = storiaAutoRenewValues({
      properties: ["pub", "pend", "none", "expired", "noext"].map((id) => ({ id, storia_auto_renew: null })),
      selectedPropertyIds: [],
      listings: [
        { property_id: "pub", status: "published", external_id: "x" },
        { property_id: "pend", status: "pending", external_id: "y" },
        { property_id: "expired", status: "expired", external_id: "z" },
        { property_id: "noext", status: "published", external_id: null },
      ],
      agencyDefault: true,
    });
    expect([...values.keys()].sort()).toEqual(["pend", "pub"]);
  });

  it("„Orice” și „Fără promovare” nu se schimbă", () => {
    expect(propertyMatchesPromotion(empty, parsePromotionSelection("any"))).toBe(false);
    expect(propertyMatchesPromotion(empty, parsePromotionSelection("none"))).toBe(true);
    const sel = parsePromotionSelection("storia:auto_renew_on,storia:auto_renew_off");
    expect(sel.storiaAutoRenew).toEqual([true, false]);
    expect(sel.any || sel.none).toBe(false);
    // Prelungirea nu e promovare: nu potrivește prin calea promovărilor.
    expect(propertyMatchesPromotion(empty, sel)).toBe(false);
  });
});
