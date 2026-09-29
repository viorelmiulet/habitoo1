import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PortalContext } from "@/lib/portals/adapter";
import { getPortalDefinition } from "@/lib/portals/registry";
import {
  isClickimobIndexMode,
  portalConnectionReady,
} from "@/lib/portals/clickimob/index-feed";

vi.mock("@/lib/portals/feed-inspect.server", () => ({
  inspectFeedProperty: async () => ({
    visible: true,
    externalId: "HB-1",
    offerUrl: null,
    agentId: "a1",
    agentName: "Agent",
    updatedAt: null,
  }),
  inspectFeedMedia: async () => ({ total: 2, resolvable: 2, broken: 0, primary: true }),
}));

import { clickimobAdapter } from "@/lib/portals/adapters/clickimob.server";

function ctx(overrides: Partial<PortalContext> = {}): PortalContext {
  return {
    organizationId: "org-1",
    definition: getPortalDefinition("clickimob")!,
    direction: "habitoo_to_portal" as never,
    authenticationMode: "api_key" as never,
    externalAccountId: null,
    portalCredential: null,
    settings: {},
    allowLiveRequests: true,
    ...overrides,
  };
}

const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("ClickImob mod index", () => {
  it("regula de mod index = regula de includere din index", () => {
    expect(isClickimobIndexMode({ activated: true, externalAccountId: null, activeKeys: 0 })).toBe(true);
    expect(isClickimobIndexMode({ activated: true, externalAccountId: "x", activeKeys: 0 })).toBe(false);
    expect(isClickimobIndexMode({ activated: true, externalAccountId: null, activeKeys: 1 })).toBe(false);
    expect(isClickimobIndexMode({ activated: false, externalAccountId: null, activeKeys: 0 })).toBe(false);
  });

  it("bifarea e permisă în mod index", () => {
    const conn = { status: "not_configured", activated: true, external_account_id: null };
    expect(portalConnectionReady("clickimob", conn, new Set())).toBe(true);
    // Conexiune pe agenție neconfigurată → rămâne blocată, ca acum.
    expect(
      portalConnectionReady("clickimob", { ...conn, external_account_id: "ag" }, new Set()),
    ).toBe(false);
    expect(portalConnectionReady("clickimob", conn, new Set(["clickimob"]))).toBe(false);
    expect(portalConnectionReady("romimo", conn, new Set())).toBe(false);
  });

  it("publish/update/withdraw în mod index nu fac nicio cerere HTTP", async () => {
    const c = ctx({ indexMode: true });
    for (const op of [
      clickimobAdapter.publishListing,
      clickimobAdapter.updateListing,
      clickimobAdapter.withdrawListing,
    ]) {
      const r = await op!(c, { propertyId: "p1", externalId: null });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data.message).toContain("ClickImob preia modificarea din feed în cel mult 15 minute");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("conexiune pe agenție: comportament neschimbat (webhook apelat)", async () => {
    const r = await clickimobAdapter.publishListing!(
      ctx({ externalAccountId: "ag-1", portalCredential: "tok" }),
      { propertyId: "p1", externalId: null },
    );
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("conexiune pe agenție incompletă, fără mod index → CONFIG_ERROR", async () => {
    const r = await clickimobAdapter.publishListing!(ctx(), { propertyId: "p1", externalId: null });
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
