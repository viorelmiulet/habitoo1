import { afterEach, describe, expect, it, vi } from "vitest";
import { imospotAdapter } from "@/lib/portals/adapters/imospot.server";
import type { PortalContext } from "@/lib/portals/adapter";

const PROPERTY_ID = "76b1d2a2-4eea-4363-b15a-7d9e29f5a202";

function ctx(): PortalContext {
  return {
    organizationId: "04041622-b3d2-4cbe-a214-2ae9bfa34492",
    definition: { id: "imospot" } as never,
    direction: "push" as never,
    authenticationMode: "api_key" as never,
    externalAccountId: null,
    portalCredential: "test-key",
    settings: {},
    allowLiveRequests: true,
  };
}

function mockFetch(handler: (url: string, init: RequestInit) => { status: number; body?: string }) {
  const calls: string[] = [];
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation((async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    const res = handler(url, init ?? {});
    return new Response(res.status === 204 ? null : (res.body ?? ""), { status: res.status });
  }) as never);
  return { calls, spy };
}

afterEach(() => vi.restoreAllMocks());

describe("retragerea de la Imospot", () => {
  it("șterge identificatorul returnat de portal, nu referința noastră", async () => {
    const { calls } = mockFetch(() => ({ status: 204 }));
    const result = await imospotAdapter.withdrawListing!(ctx(), {
      propertyId: PROPERTY_ID,
      externalId: "21785",
    });
    expect(result.ok).toBe(true);
    expect(calls).toEqual(["DELETE https://www.imospot.ro/api/v1/listings/21785"]);
    if (result.ok) {
      expect(result.data.processed).toBe(1);
      expect(result.data.externalId).toBe("21785");
    }
  });

  it("încearcă referințele noastre doar când portalul nu găsește anunțul", async () => {
    const { calls } = mockFetch((url) => ({ status: url.endsWith("SALE") ? 204 : 404 }));
    const result = await imospotAdapter.withdrawListing!(ctx(), {
      propertyId: PROPERTY_ID,
      externalId: "21785",
    });
    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      "DELETE https://www.imospot.ro/api/v1/listings/21785",
      `DELETE https://www.imospot.ro/api/v1/listings/HBT-${PROPERTY_ID}-SALE`,
    ]);
    if (result.ok) expect(result.data.externalId).toBe(`HBT-${PROPERTY_ID}-SALE`);
  });

  it("raportează onest când portalul nu are nimic de retras", async () => {
    mockFetch(() => ({ status: 404 }));
    const result = await imospotAdapter.withdrawListing!(ctx(), {
      propertyId: PROPERTY_ID,
      externalId: "21785",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.processed).toBe(0);
      expect(result.data.message).toContain("nu a găsit anunțul");
      expect(result.data.externalId).toBe("21785");
    }
  });

  it("propagă eroarea portalului fără să încerce rezerva", async () => {
    const { calls } = mockFetch(() => ({ status: 500, body: "boom" }));
    const result = await imospotAdapter.withdrawListing!(ctx(), {
      propertyId: PROPERTY_ID,
      externalId: "21785",
    });
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(1);
  });
});
