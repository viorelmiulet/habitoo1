import { beforeEach, describe, expect, it, vi } from "vitest";
import { imobiliareAdapter } from "../../adapters/imobiliare.server";
import type { PortalContext, ListingRef } from "../../adapter";

const mocks = vi.hoisted(() => ({
  property: { property_type: "apartment", floor: null, floor_label: null } as {
    property_type: string; floor: number | null; floor_label: string | null;
  },
  session: vi.fn(),
  request: vi.fn(),
  filters: vi.fn(),
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => {
      const query = {
        select: () => query,
        eq: (field: string, value: string) => {
          mocks.filters(field, value);
          return query;
        },
        maybeSingle: async () => ({ data: mocks.property, error: null }),
      };
      return query;
    },
  },
}));
vi.mock("../auth.server", () => ({
  getImobiliareSession: mocks.session,
  imobiliareAuthedRequest: mocks.request,
}));

describe("etaj verificat înainte de orice apel Imobiliare.ro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.property = { property_type: "apartment", floor: null, floor_label: null };
  });

  it.each(["publishListing", "updateListing"] as const)("%s oprește apartamentul fără etaj înainte de autorizare", async (operation) => {
    const result = await imobiliareAdapter[operation](
      { organizationId: "org-test", allowLiveRequests: true } as PortalContext,
      { propertyId: "property-test" } as ListingRef,
    );
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR", message: "Completează etajul" });
    expect(mocks.filters).toHaveBeenCalledWith("organization_id", "org-test");
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("oprește mansarda fără număr confirmat înainte de autorizare", async () => {
    mocks.property.floor_label = "Mansardă";
    const result = await imobiliareAdapter.publishListing(
      { organizationId: "org-test", allowLiveRequests: true } as PortalContext,
      { propertyId: "property-test" } as ListingRef,
    );
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    if (!result.ok) expect(result.message).toContain("Mansardă nu e confirmată");
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });
});