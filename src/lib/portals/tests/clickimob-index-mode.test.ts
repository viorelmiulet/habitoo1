import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PortalContext } from "@/lib/portals/adapter";
import { getPortalDefinition } from "@/lib/portals/registry";
import { assertPortalKeyAllowed } from "@/lib/portals/key-policy";
import {
  clickimobIndexStatusLabel,
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

const def = getPortalDefinition("clickimob")!;

function ctx(overrides: Partial<PortalContext> = {}): PortalContext {
  return {
    organizationId: "org-1",
    definition: def,
    direction: "habitoo_to_portal" as never,
    authenticationMode: "none" as never,
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

describe("ClickImob doar prin index", () => {
  it("cardul nu mai are câmpuri manuale, test de conexiune sau chei", () => {
    expect(def.configuration_schema.fields).toHaveLength(0);
    expect(def.authentication).toEqual(["none"]);
    expect(def.capabilities).not.toContain("test_connection");
    expect(def.capabilities).not.toContain("webhook_send");
  });

  it("generarea unei chei ClickImob e respinsă", () => {
    expect(() => assertPortalKeyAllowed(def)).toThrow(/ClickImob nu folosește chei/);
    expect(() => assertPortalKeyAllowed({ ...def, authentication: ["habitoo_api_key"] })).toThrow(
      /ClickImob/,
    );
  });

  it("bifarea e permisă imediat ce ClickImob e activat", () => {
    expect(portalConnectionReady("clickimob", { status: "not_configured", activated: true })).toBe(true);
    expect(portalConnectionReady("clickimob", { status: "not_configured", activated: false })).toBe(false);
    expect(portalConnectionReady("romimo", { status: "not_configured", activated: true })).toBe(false);
  });

  it("publish/update/withdraw nu fac nicio cerere HTTP, chiar cu date vechi de conexiune", async () => {
    const c = ctx({ externalAccountId: "ag-1", portalCredential: "tok" });
    for (const op of [
      clickimobAdapter.publishListing,
      clickimobAdapter.updateListing,
      clickimobAdapter.withdrawListing,
    ]) {
      const r = await op!(c, { propertyId: "p1", externalId: null });
      expect(r.ok).toBe(true);
      if (r.ok)
        expect(r.data.message).toContain("ClickImob preia modificarea din feed în cel mult 15 minute");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stările din index", () => {
    const base = { entry: null, orgOpen: true, activated: true, selected: 0, graceDays: 7 };
    expect(clickimobIndexStatusLabel({ ...base, entry: { status: "active", inactive_since: null } })).toBe(
      "În index",
    );
    expect(
      clickimobIndexStatusLabel({
        ...base,
        entry: { status: "grace", inactive_since: "2026-09-01T10:00:00Z" },
      }),
    ).toBe("În perioada de retragere până la 08.09.2026");
    expect(clickimobIndexStatusLabel(base)).toBe("Nu apare: nicio ofertă bifată pentru ClickImob");
    expect(clickimobIndexStatusLabel({ ...base, orgOpen: false })).toBe(
      "Agenție suspendată sau arhivată",
    );
  });
});
