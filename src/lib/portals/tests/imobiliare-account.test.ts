import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  describeImobiliareAccount,
  parseImobiliareAccount,
  subscriptionInactive,
  IMOBILIARE_NO_SUBSCRIPTION_MESSAGE,
} from "@/lib/portals/imobiliare/account";
import {
  clearImobiliareAccountCache,
  fetchImobiliareAccount,
  IMOBILIARE_ACCOUNT_TTL_MS,
} from "@/lib/portals/imobiliare/account.server";
import { displayListingPublicUrl, resolveListingPublicUrl } from "@/lib/portals/link";

const ME_BODY = {
  data: {
    id: 4978539,
    agency: {
      name: "API Publicare Test",
      is_subscription_active: false,
      subscription_status: "disabled",
      subscription_type: "none",
      listing_online_count: 46,
    },
  },
};

describe("starea contului Imobiliare.ro", () => {
  it("citește abonamentul, statusul, tipul și numărul de anunțuri online", () => {
    expect(parseImobiliareAccount(ME_BODY)).toEqual({
      isSubscriptionActive: false,
      subscriptionStatus: "disabled",
      subscriptionType: "none",
      listingOnlineCount: 46,
    });
  });

  it("câmpurile absente rămân necunoscute, nu „inactiv”", () => {
    const state = parseImobiliareAccount({ data: { agency: {} } });
    expect(state.isSubscriptionActive).toBeNull();
    expect(subscriptionInactive(state)).toBe(false);
    expect(subscriptionInactive(null)).toBe(false);
    expect(describeImobiliareAccount(state)).toContain("nu a putut fi citită");
  });

  it("descrie explicit lipsa abonamentului", () => {
    const text = describeImobiliareAccount(parseImobiliareAccount(ME_BODY));
    expect(text).toContain(IMOBILIARE_NO_SUBSCRIPTION_MESSAGE);
    expect(text).toContain("46");
  });

  it("descrie abonamentul activ", () => {
    const text = describeImobiliareAccount({
      isSubscriptionActive: true,
      subscriptionStatus: "active",
      subscriptionType: "premium",
      listingOnlineCount: 12,
    });
    expect(text).toContain("activ");
    expect(text).toContain("premium");
  });
});

describe("memorarea apelului /api/v3/me", () => {
  beforeEach(() => clearImobiliareAccountCache());

  it("nu interoghează portalul la fiecare încărcare de pagină", async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify(ME_BODY), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const original = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      const session = { accessToken: "token" } as never;
      const first = await fetchImobiliareAccount(session, "org-1", 1_000);
      const second = await fetchImobiliareAccount(session, "org-1", 1_000 + 60_000);
      expect(first?.isSubscriptionActive).toBe(false);
      expect(second).toEqual(first);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      // După expirarea memorării, se cere din nou.
      await fetchImobiliareAccount(session, "org-1", 1_000 + IMOBILIARE_ACCOUNT_TTL_MS + 1);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("linkul ofertei când contul nu are abonament", () => {
  const stored = "https://www.imobiliare.ro/oferta/x-275991125";

  it("ascunde linkul, dar NU îl șterge din bază", () => {
    const diagnostics = {
      offerUrl: null,
      stateKnown: true,
      portalState: "online",
      offerUrlSuppressed: true,
    };
    expect(displayListingPublicUrl(diagnostics, stored)).toBeNull();
    // ce se salvează rămâne neatins: nu e o ciornă confirmată de portal
    expect(resolveListingPublicUrl(diagnostics, stored)).toBe(stored);
  });

  it("cu abonament activ, comportamentul rămâne neschimbat", () => {
    const diagnostics = {
      offerUrl: stored,
      stateKnown: true,
      portalState: "online",
      offerUrlSuppressed: false,
    };
    expect(displayListingPublicUrl(diagnostics, stored)).toBe(stored);
    expect(displayListingPublicUrl(null, stored)).toBe(stored);
  });
});
