import { describe, expect, it, vi } from "vitest";

import { portalSaysOffline, resolveListingPublicUrl } from "@/lib/portals/link";
import { fetchImobiliarePublicUrlWithRetries } from "@/lib/portals/adapters/imobiliare.server";

describe("linkul public al ofertei", () => {
  it("păstrează linkul salvat când verificarea nu a reușit", () => {
    // diagnoza a eșuat: nu știm starea, deci nu ștergem nimic
    const diagnostics = { offerUrl: null, stateKnown: false, portalState: null };
    expect(portalSaysOffline(diagnostics)).toBe(false);
    expect(resolveListingPublicUrl(diagnostics, "https://www.imobiliare.ro/oferta/x-1")).toBe(
      "https://www.imobiliare.ro/oferta/x-1",
    );
  });

  it("păstrează linkul salvat când nu s-a rulat nicio diagnoză", () => {
    expect(resolveListingPublicUrl(null, "https://www.imobiliare.ro/oferta/x-1")).toBe(
      "https://www.imobiliare.ro/oferta/x-1",
    );
  });

  it("șterge linkul doar când portalul raportează explicit starea ciornă", () => {
    const diagnostics = { offerUrl: null, stateKnown: true, portalState: "draft" };
    expect(portalSaysOffline(diagnostics)).toBe(true);
    expect(resolveListingPublicUrl(diagnostics, "https://www.imobiliare.ro/oferta/x-1")).toBeNull();
  });

  it("linkul confirmat acum de portal are prioritate față de cel salvat", () => {
    const diagnostics = {
      offerUrl: "https://www.imobiliare.ro/oferta/nou-2",
      stateKnown: true,
      portalState: "online",
    };
    expect(resolveListingPublicUrl(diagnostics, "https://www.imobiliare.ro/oferta/x-1")).toBe(
      "https://www.imobiliare.ro/oferta/nou-2",
    );
  });
});

describe("reîncercarea linkului după publicare", () => {
  it("reîncearcă până portalul întoarce adresa publică", async () => {
    const bodies = [
      { data: { state: "draft" } },
      { data: { state: "draft" } },
      { data: { state: "online", path: "/oferta/apartament-275991125" } },
    ];
    let call = 0;
    const fetchSpy = vi.fn(async () => {
      const body = bodies[Math.min(call++, bodies.length - 1)];
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const original = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      const url = await fetchImobiliarePublicUrlWithRetries(
        { accessToken: "token" } as never,
        { organizationId: "org-1", allowLiveRequests: true } as never,
        "HB-1006",
        [0, 0],
      );
      expect(call).toBe(3);
      expect(url).toContain("/oferta/apartament-275991125");
    } finally {
      globalThis.fetch = original;
    }
  });
});
