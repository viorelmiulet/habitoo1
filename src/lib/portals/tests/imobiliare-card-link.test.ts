import { describe, expect, it } from "vitest";
import { describeImobiliareAccount, imobiliareCardUrl, subscriptionInactive } from "../imobiliare/account";

const URL = "https://www.imobiliare.ro/oferta/hb-1261";

describe("Imobiliare.ro — linkul de pe card", () => {
  it("anunț publicat cu public_url → «Vezi anunțul» vizibil, fără mesaj de abonament", () => {
    expect(imobiliareCardUrl({ status: "published", public_url: URL }, null)).toBe(URL);
    expect(imobiliareCardUrl({ status: "updated", public_url: URL }, null)).toBe(URL);
  });
  it("is_subscription_active=false nu mai ascunde linkul și nu dă avertismente", () => {
    const state = { isSubscriptionActive: false, subscriptionStatus: "disabled", subscriptionType: "none", listingOnlineCount: 46 };
    expect(subscriptionInactive(state)).toBe(false);
    expect(describeImobiliareAccount(state)).not.toContain("nu are abonament activ");
    expect(describeImobiliareAccount(state)).toContain("46");
  });
  it("anunț nepublicat → fără link", () => {
    expect(imobiliareCardUrl({ status: "withdrawn", public_url: URL }, URL)).toBeNull();
    expect(imobiliareCardUrl({ status: "pending", public_url: URL }, null)).toBeNull();
    expect(imobiliareCardUrl(null, URL)).toBeNull();
  });
});
