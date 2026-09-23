import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PortalContext } from "@/lib/portals/adapter";
import { createPrimulAnuntAdapter } from "@/lib/portals/adapters/primulanunt.server";

const ORGANIZATION_ID = "04041622-b3d2-4cbe-a214-2ae9bfa34492";
const PROPERTY_ID = "76b1d2a2-4eea-4363-b15a-7d9e29f5a202";
const AGENT_ID = "1b2c3d4e-5f60-4712-8899-aabbccddeeff";

/** Rândul complet al unei oferte, cu numele reale de coloane din schemă. */
function propertyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PROPERTY_ID,
    organization_id: ORGANIZATION_ID,
    reference: "HB-1009",
    property_type: "apartment",
    transaction_kind: "sale",
    title: "Apartament 2 camere Militari",
    description: "Apartament decomandat, bloc 2019, complet mobilat și utilat.",
    price: 55000,
    currency: "EUR",
    sale_price: 124000,
    sale_currency: "eur",
    rooms: 2,
    bathrooms: 1,
    usable_surface: 52,
    county: "Cluj",
    city: "Cluj-Napoca",
    district: "Militari",
    features: ["Balcon", "Parcare"],
    lat: 46.77,
    lng: 23.6,
    postal_code: "400123",
    floor: 1,
    building_floors: 4,
    assigned_to: AGENT_ID,
    ...overrides,
  };
}

type Fixture = {
  property: Record<string, unknown> | null;
  agent: Record<string, unknown> | null;
  organization: Record<string, unknown> | null;
  reference?: string;
};

let fixture: Fixture;

/** Mock minimal al clientului de bază de date, în stilul celorlalte teste server. */
function builderFor(table: string) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    maybeSingle: async () => {
      if (table === "properties") return { data: fixture.property, error: null };
      if (table === "profiles") return { data: fixture.agent, error: null };
      if (table === "organizations") return { data: fixture.organization, error: null };
      return { data: null, error: null };
    },
    then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
      resolve({ data: [], error: null }),
  };
  return chain;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => builderFor(table),
    rpc: async () => ({ data: fixture.reference ?? "HB-2000", error: null }),
  },
}));

function ctx(overrides: Partial<PortalContext> = {}): PortalContext {
  return {
    organizationId: ORGANIZATION_ID,
    definition: { id: "primulanunt" } as never,
    direction: "habitoo_to_portal" as never,
    authenticationMode: "portal_api_key" as never,
    externalAccountId: null,
    portalCredential: "pa_live_secret",
    settings: {},
    allowLiveRequests: true,
    ...overrides,
  };
}

function mockFetch() {
  const calls: { url: string; method: string; body: unknown }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
    });
    return new Response(
      JSON.stringify({
        id: "pa-1",
        external_id: "HB-1009",
        status: "active",
        url: "https://www.primulanunt.ro/anunt/hb-1009",
      }),
      { status: 200 },
    );
  }) as never);
  return calls;
}

beforeEach(() => {
  fixture = {
    property: propertyRow(),
    agent: { full_name: "Marius Grigore", email: "marius@exemplu.ro", phone: "+40727151461" },
    organization: { phone: "0700000001", material_phone: null },
  };
});

afterEach(() => vi.restoreAllMocks());

describe("loadPrimulAnuntMapperInput", () => {
  it("construiește datele mapper-ului din coloanele reale", async () => {
    const { loadPrimulAnuntMapperInput } = await import(
      "@/lib/portals/primulanunt/loadProperty.server"
    );
    const loaded = await loadPrimulAnuntMapperInput(PROPERTY_ID, {
      organizationId: ORGANIZATION_ID,
    });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.property.reference).toBe("HB-1009");
    expect(loaded.property.bathrooms).toBe(1);
    expect(loaded.property.postalCode).toBe("400123");
    expect(loaded.property.buildingFloors).toBe(4);
    expect(loaded.property.features).toEqual(["Balcon", "Parcare"]);
    expect(loaded.property.usableSurface).toBe(52);
    expect(loaded.context.agent).toEqual({
      fullName: "Marius Grigore",
      email: "marius@exemplu.ro",
      phone: "+40727151461",
    });
    expect(loaded.context.organization).toEqual({ phone: "0700000001", materialPhone: null });
  });

  it("raportează lipsa proprietății", async () => {
    fixture.property = null;
    const { loadPrimulAnuntMapperInput } = await import(
      "@/lib/portals/primulanunt/loadProperty.server"
    );
    const loaded = await loadPrimulAnuntMapperInput(PROPERTY_ID, {
      organizationId: ORGANIZATION_ID,
    });
    expect(loaded).toEqual({ ok: false, reasons: ["Proprietatea nu a fost găsită."] });
  });

  it("generează referința CRM prin funcția din bază când lipsește", async () => {
    fixture.property = propertyRow({ reference: null });
    fixture.reference = "HB-1010";
    const { loadPrimulAnuntMapperInput } = await import(
      "@/lib/portals/primulanunt/loadProperty.server"
    );
    const loaded = await loadPrimulAnuntMapperInput(PROPERTY_ID, {
      organizationId: ORGANIZATION_ID,
    });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.property.reference).toBeNull();
    expect(await loaded.context.generateReference?.()).toBe("HB-1010");
  });
});

describe("publicarea PrimulAnunț.ro cu date reale", () => {
  it("trimite payload-ul complet construit de mapper", async () => {
    const calls = mockFetch();
    const { buildPrimulAnuntListing } = await import("@/lib/portals/adapters/primulanunt.server");
    const adapter = createPrimulAnuntAdapter(buildPrimulAnuntListing);

    const result = await adapter.publishListing(ctx(), {
      propertyId: PROPERTY_ID,
      externalId: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.externalId).toBe("HB-1009");
    expect(result.data.publicUrl).toBe("https://www.primulanunt.ro/anunt/hb-1009");

    const listing = calls.find((call) => call.url.includes("/api/public/v1/listings"));
    expect(listing?.method).toBe("POST");
    const dto = listing?.body as Record<string, unknown>;
    expect(dto["external_id"]).toBe("HB-1009");
    expect(dto["purpose"]).toBe("sale");
    expect(dto["price"]).toBe(124000);
    expect(dto["currency"]).toBe("EUR");
    expect(dto["county"]).toBe("Cluj");
    expect(dto["city"]).toBe("Cluj-Napoca");
    expect(dto["area"]).toBe("Militari");
    expect(dto["rooms"]).toBe(2);
    expect(dto["bathrooms"]).toBe(1);
    expect(dto["surface_m2"]).toBe(52);
    expect(dto["postal_code"]).toBe("400123");
    expect(dto["floor"]).toBe(1);
    expect(dto["floors_total"]).toBe(4);
    expect(dto["features"]).toEqual(["Balcon", "Parcare"]);
    expect(dto["agent_phone"]).toBe("+40727151461");
    expect(dto["is_private"]).toBe(false);
  });

  it("atașează avertismentele mapper-ului fără să blocheze publicarea", async () => {
    mockFetch();
    fixture.agent = null;
    fixture.organization = { phone: null, material_phone: null };
    fixture.property = propertyRow({ assigned_to: null });
    const { buildPrimulAnuntListing } = await import("@/lib/portals/adapters/primulanunt.server");
    const adapter = createPrimulAnuntAdapter(buildPrimulAnuntListing);
    const result = await adapter.publishListing(ctx(), {
      propertyId: PROPERTY_ID,
      externalId: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.message).toContain("date de contact");
  });

  it("refuză publicarea cu toate motivele mapper-ului, în română", async () => {
    const calls = mockFetch();
    fixture.property = propertyRow({ description: null, county: null });
    const { buildPrimulAnuntListing } = await import("@/lib/portals/adapters/primulanunt.server");
    const adapter = createPrimulAnuntAdapter(buildPrimulAnuntListing);

    const result = await adapter.updateListing(ctx(), {
      propertyId: PROPERTY_ID,
      externalId: "HB-1009",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("VALIDATION_ERROR");
    expect(result.message).toContain("Oferta nu are descriere");
    expect(result.message).toContain("Oferta nu are județ completat");
    expect(calls).toHaveLength(0);
  });
});
