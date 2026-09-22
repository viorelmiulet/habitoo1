import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PortalContext } from "@/lib/portals/adapter";
import { createRomimoAdapter } from "@/lib/portals/adapters/romimo.server";

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
    rooms: 2,
    title: "Apartament 2 camere Militari",
    description: "Apartament decomandat, bloc 2019, complet mobilat și utilat.",
    price: 55000,
    currency: "EUR",
    sale_price: 124000,
    sale_currency: "EUR",
    county: "Cluj",
    city: "Cluj-Napoca",
    district: "Militari",
    lat: 46.77,
    lng: 23.6,
    assigned_to: AGENT_ID,
    usable_surface: 52,
    built_surface: null,
    land_surface: null,
    surface: 58,
    floor: 1,
    // Există în schemă, dar mapper-ul trebuie să îl ignore complet.
    floor_label: "Etaj 2",
    layout: "Decomandat",
    build_year: 2019,
    heating_systems: ["Centrală proprie"],
    ...overrides,
  };
}

type Fixture = {
  property: Record<string, unknown> | null;
  images: Record<string, unknown>[];
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
      resolve({ data: table === "property_images" ? fixture.images : [], error: null }),
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
    definition: { id: "romimo" } as never,
    direction: "habitoo_to_portal" as never,
    authenticationMode: "portal_api_key" as never,
    externalAccountId: "agentie@exemplu.ro",
    portalCredential: "api-key-secret",
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
    if (url.includes("/api/Token")) return new Response('"jwt-token"', { status: 200 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as never);
  return calls;
}

beforeEach(() => {
  fixture = {
    property: propertyRow(),
    images: [
      { id: "img-1", include_in_publish: true, is_confidential: false, position: 1 },
      { id: "img-2", include_in_publish: true, is_confidential: true, position: 2 },
      { id: "img-3", include_in_publish: false, is_confidential: false, position: 3 },
      { id: "img-4", include_in_publish: true, is_confidential: false, position: 4 },
    ],
    agent: { full_name: "Marius Grigore", email: "marius@exemplu.ro", phone: "+40727151461" },
    organization: { phone: "0700000001", material_phone: null },
  };
});

afterEach(() => vi.restoreAllMocks());

describe("loadRomimoMapperInput", () => {
  it("construiește datele mapper-ului din coloanele reale", async () => {
    const { loadRomimoMapperInput } = await import("@/lib/portals/romimo/loadProperty.server");
    const loaded = await loadRomimoMapperInput(PROPERTY_ID, { organizationId: ORGANIZATION_ID });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.property.reference).toBe("HB-1009");
    expect(loaded.property.usableSurface).toBe(52);
    expect(loaded.property.floor).toBe(1);
    expect(loaded.property.heatingSystems).toEqual(["Centrală proprie"]);
    expect(loaded.property.images.map((image) => image.id)).toEqual([
      "img-1",
      "img-2",
      "img-3",
      "img-4",
    ]);
    expect(loaded.context.agent).toEqual({
      fullName: "Marius Grigore",
      email: "marius@exemplu.ro",
      phone: "+40727151461",
    });
    expect(loaded.context.organization).toEqual({ phone: "0700000001", materialPhone: null });
    expect(loaded.context.publicBaseUrl).toBe("https://crm.habitoo.ro");
  });

  it("raportează lipsa proprietății", async () => {
    fixture.property = null;
    const { loadRomimoMapperInput } = await import("@/lib/portals/romimo/loadProperty.server");
    const loaded = await loadRomimoMapperInput(PROPERTY_ID, { organizationId: ORGANIZATION_ID });
    expect(loaded).toEqual({ ok: false, reasons: ["Proprietatea nu a fost găsită."] });
  });

  it("generează referința CRM prin funcția din bază când lipsește", async () => {
    fixture.property = propertyRow({ reference: null });
    fixture.reference = "HB-1010";
    const { loadRomimoMapperInput } = await import("@/lib/portals/romimo/loadProperty.server");
    const loaded = await loadRomimoMapperInput(PROPERTY_ID, { organizationId: ORGANIZATION_ID });
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.property.reference).toBeNull();
    expect(await loaded.context.generateReference?.()).toBe("HB-1010");
  });
});

describe("publicarea Romimo cu date reale", () => {
  it("trimite payload-ul complet construit de mapper", async () => {
    const calls = mockFetch();
    const { buildRomimoArticle } = await import("@/lib/portals/adapters/romimo.server");
    const adapter = createRomimoAdapter(buildRomimoArticle);

    const result = await adapter.publishListing(ctx(), {
      propertyId: PROPERTY_ID,
      externalId: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.externalId).toBe("HB-1009");

    const article = calls.find((call) => call.url.includes("/api/Article"));
    expect(article?.method).toBe("POST");
    const dto = article?.body as Record<string, Record<string, unknown>>;
    expect(dto["user"]).toEqual({ email: "agentie@exemplu.ro" });
    expect(dto["ad"]?.["externalid"]).toBe("HB-1009");
    expect(dto["ad"]?.["category"]).toBe(338);
    expect(dto["ad"]?.["price"]).toBe(124000);
    expect(dto["contact"]?.["contactPhone"]).toBe("+40727151461");
    expect(dto["location"]?.["countyName"]).toBe("Cluj");
    expect(dto["properties"]).toEqual(
      expect.arrayContaining([
        { key: "livingspace", value: "52" },
        { key: "roomno", value: "2 camere" },
        { key: "storey", value: "Etaj 1" },
        { key: "resfeatures", value: "Decomandat" },
      ]),
    );
    expect(dto["pictures"]).toEqual([
      { url: "https://crm.habitoo.ro/api/public/sites/v1/media/img-1", rank: 1 },
      { url: "https://crm.habitoo.ro/api/public/sites/v1/media/img-4", rank: 2 },
    ]);
  });

  it("atașează avertismentele mapper-ului fără să blocheze publicarea", async () => {
    mockFetch();
    fixture.images = [];
    const { buildRomimoArticle } = await import("@/lib/portals/adapters/romimo.server");
    const adapter = createRomimoAdapter(buildRomimoArticle);
    const result = await adapter.publishListing(ctx(), {
      propertyId: PROPERTY_ID,
      externalId: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.message).toContain("nicio poză eligibilă");
  });

  it("refuză publicarea cu toate motivele mapper-ului, în română", async () => {
    const calls = mockFetch();
    fixture.property = propertyRow({ description: null, usable_surface: null });
    const { buildRomimoArticle } = await import("@/lib/portals/adapters/romimo.server");
    const adapter = createRomimoAdapter(buildRomimoArticle);

    const result = await adapter.updateListing(ctx(), {
      propertyId: PROPERTY_ID,
      externalId: "HB-1009",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("VALIDATION_ERROR");
    expect(result.message).toContain("Oferta nu are descriere");
    expect(result.message).toContain("Lipsește suprafața utilă");
    expect(calls).toHaveLength(0);
  });
});
