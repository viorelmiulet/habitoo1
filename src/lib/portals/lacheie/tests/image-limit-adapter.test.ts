import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ count: 45, requests: [] as { method: string; body: { images?: string[] } }[] }));
type MockQuery = {
  select: () => MockQuery; eq: () => MockQuery; order: () => MockQuery;
  maybeSingle: () => Promise<{ data: unknown }>;
  then: (resolve: (value: unknown) => unknown) => Promise<unknown>;
};
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (table: string) => {
    const data = table === "properties" ? {
      id: "p1", organization_id: "org1", status: "active", publish_status: "published", deleted_at: null,
      title: "Apartament luminos cu trei camere", description: "Apartament luminos aproape de parc și mijloace de transport.",
      property_type: "apartment", for_sale: true, for_rent: false, sale_price: 100000, sale_currency: "EUR",
      usable_surface: 70, bedrooms: 2, bathrooms: 1, build_year: 2010, assigned_to: "agent1", city: "București", county: "București",
    } : table === "property_images" ? Array.from({ length: state.count + 2 }, (_, i) => ({
      id: `image-${i}`, position: i, is_primary: i === state.count - 1, include_in_publish: i !== state.count, is_confidential: i === state.count + 1,
    })).reverse() : table === "profiles" ? { id: "agent1", full_name: "Ana Pop", phone: "0722123456" } : { phone: "0722123456" };
    const query: MockQuery = { select: () => query, eq: () => query, order: () => query, maybeSingle: async () => ({ data }), then: (resolve) => Promise.resolve({ data }).then(resolve) };
    return query;
  } },
}));
vi.mock("../catalog.server", () => ({ readLaCheieCatalog: async () => ({}), refreshLaCheieCatalog: vi.fn() }));
vi.mock("../catalog", () => ({
  resolveLaCheieIds: () => ({ ok: true, propertyTypeId: "1", countyId: "2", cityId: "3" }), laCheieCategory: () => "apartment",
  resolveOptionId: () => null, resolveOptionPk: () => null, resolveOptionPks: () => [], constructionStageFor: () => null, petFriendlyFor: () => null,
}));
vi.mock("../credentials.server", () => ({ laCheieCrmApiKey: () => "mock-key", hasLaCheieCrmApiKey: () => true }));
vi.mock("../version.server", () => ({ reserveNextVersion: async () => "3", recordVersionOutcome: async () => undefined, readVersionRecord: async () => null }));
vi.mock("../client.server", () => ({
  withLaCheieWriteLock: async (_key: string, run: () => Promise<unknown>) => run(),
  laCheieRequest: async (_config: unknown, input: { method: string; body: { images?: string[] } }) => {
    state.requests.push(input);
    return { ok: true, status: 200, body: { offer: { status: "published" } }, classification: null };
  },
}));

import { lacheieAdapter } from "../../adapters/lacheie.server";
import { getPortalDefinition } from "../../registry";
import type { PortalContext } from "../../adapter";

function context(): PortalContext {
  const definition = getPortalDefinition("lacheie");
  if (!definition) throw new Error("Portal missing");
  return { organizationId: "org1", definition, direction: "habitoo_to_portal", authenticationMode: "portal_api_key", externalAccountId: null,
    portalCredential: null, settings: { lacheie_agency_external_id: "hbt-org1", lacheie_agency_status: "active" }, allowLiveRequests: true };
}
describe("La Cheie: galerie prin adaptorul real, transport simulat", () => {
  beforeEach(() => { state.requests.length = 0; state.count = 45; });
  it("publicare și două actualizări/republicări: 30, principală prima, avertisment în rezultat", async () => {
    const ctx = context(), ref = { propertyId: "p1", externalId: null };
    const results = [await lacheieAdapter.publishListing(ctx, ref), await lacheieAdapter.updateListing(ctx, ref), await lacheieAdapter.publishListing(ctx, ref)];
    expect(state.requests).toHaveLength(3);
    for (const result of results) {
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("publicare blocată");
      expect(result.data.mediaWarning).toBe("La Cheie: se trimit primele 30 din 45 poze.");
      expect(result.data.message).toContain("La Cheie: se trimit primele 30 din 45 poze.");
    }
    for (const request of state.requests) {
      expect(request.method).toBe("PUT");
      expect(request.body.images).toHaveLength(30);
      expect(request.body.images?.[0]).toContain("image-44");
      expect(request.body.images).toEqual(state.requests[0]?.body.images);
      expect(request.body.images?.some((url) => url.endsWith("image-45") || url.endsWith("image-46"))).toBe(false);
    }
  });
  it("20 images publicables: toate sunt trimise fără avertisment", async () => {
    state.count = 20;
    const result = await lacheieAdapter.publishListing(context(), { propertyId: "p1", externalId: null });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("publicare blocată");
    expect(state.requests[0]?.body.images).toHaveLength(20);
    expect(result.data.mediaWarning).toBeNull();
  });
});