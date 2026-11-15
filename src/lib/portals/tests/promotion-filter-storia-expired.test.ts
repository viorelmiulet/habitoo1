import { describe, expect, it } from "vitest";
import {
  STORIA_EXPIRED,
  matchingPropertyIds,
  parsePromotionSelection,
  promotionFilterGroups,
  promotionFilterLabel,
  promotionSelectionIsEmpty,
  togglePromotionValue,
} from "@/lib/portals/promotion-filter";
import { STORIA_EXPIRED_REASON, storiaExpiredListingFilter } from "@/lib/portals/storia/expiry";

describe("Storia · filtrul „Expirate” din lista de proprietăți", () => {
  it("opțiunea apare în grupa Storia, după prelungirea automată", () => {
    const group = promotionFilterGroups(new Set(["storia"])).find((g) => g.portalId === "storia");
    expect(group?.options.map((o) => o.value)).toEqual([
      "storia:auto_renew_on",
      "storia:auto_renew_off",
      STORIA_EXPIRED,
      "storia:error",
    ]);
    expect(group?.options.find((o) => o.value === STORIA_EXPIRED)?.label).toBe("Expirate");
    expect(promotionFilterLabel(STORIA_EXPIRED, group ? [group] : [])).toBe("Storia · Expirate");
  });

  it("selecția se parsează din URL și nu e goală", () => {
    const selection = parsePromotionSelection(STORIA_EXPIRED);
    expect(selection.storiaExpired).toBe(true);
    expect(promotionSelectionIsEmpty(selection)).toBe(false);
    expect(promotionSelectionIsEmpty(parsePromotionSelection(""))).toBe(true);
  });

  it("se combină liber cu celelalte filtre de portal", () => {
    const values = togglePromotionValue(["storia:auto_renew_off"], STORIA_EXPIRED);
    expect(values).toEqual(["storia:auto_renew_off", STORIA_EXPIRED]);
    expect(togglePromotionValue(values, STORIA_EXPIRED)).toEqual(["storia:auto_renew_off"]);
  });

  it("filtrul server vizează doar retragerile cu motivul de expirare", () => {
    const filter = storiaExpiredListingFilter();
    expect(filter.portal).toBe("storia");
    expect(filter.status).toBe("withdrawn");
    // Motivul vine din constantă, nu din text copiat: retragerile manuale („user”) nu se potrivesc.
    expect(filter.reason).toBe(STORIA_EXPIRED_REASON);
    expect(filter.reason).not.toBe("user");
  });

  it("potrivește doar proprietățile debifate automat, nu și retragerile manuale", () => {
    const selection = parsePromotionSelection(STORIA_EXPIRED);
    // „expired” are withdraw_reason = STORIA_EXPIRED_REASON; „manual” a fost retras de agent.
    const expiredIds = ["expired"];
    const matched = matchingPropertyIds(selection, new Map(), new Map(), [], [], undefined, expiredIds);
    expect(matched).toEqual(["expired"]);
    expect(matched).not.toContain("manual");
  });

  it("se intersectează (ȘI) cu celelalte condiții ale filtrului", () => {
    const selection = parsePromotionSelection(`${STORIA_EXPIRED},storia:auto_renew_off`);
    const autoRenew = new Map([
      ["expired", false],
      ["expired-but-renewed", true],
    ]);
    const matched = matchingPropertyIds(selection, new Map(), autoRenew, [], [], undefined, ["expired", "expired-but-renewed"]);
    expect(matched).toEqual(["expired"]);
  });
});
