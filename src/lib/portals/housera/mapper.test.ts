import { describe, expect, it, vi } from "vitest";
import { houseraAffectedCodes, mapPropertyToHousera, streetFromAddress, stripHouseraContacts, type HouseraMapperProperty } from "./mapper";
import type { HouseraSchema } from "./schema";
import { fetchHouseraSchema } from "./taxonomy.server";

const ALL = ["apartment", "house", "land", "commercial", "warehouse"];
const schema: HouseraSchema = {
  version: "v1",
  currencies: ["EUR", "RON"],
  types: [
    { code: "apartment", transactions: ["sale", "rent"], subtypes: [{ code: "studio" }, { code: "standard" }, { code: "penthouse" }] },
    { code: "house", transactions: ["sale", "rent"], subtypes: [{ code: "detached" }, { code: "villa" }] },
    { code: "land", transactions: ["sale", "rent"], subtypes: [{ code: "building" }] },
  ],
  fields: Object.fromEntries([
    ...["title", "description", "content_locale", "latitude", "longitude", "city", "street", "street_number", "county", "area", "postal_code", "country", "price", "price_currency", "negotiable", "features", "year_built"].map((f) => [f, { type: "text", types: ALL }]),
    ["usable_area_sqm", { type: "decimal", types: ["apartment", "house"] }],
    ["built_area_sqm", { type: "decimal", types: ["apartment", "house"] }],
    ["land_area_sqm", { type: "decimal", types: ["house", "land"] }],
    ["surface_balconies", { type: "decimal", types: ["apartment", "house"] }],
    ["surface_yard", { type: "decimal", types: ["warehouse"] }],
    ["rooms", { type: "integer", types: ["apartment", "house"] }],
    ["bedrooms", { type: "integer", types: ["apartment", "house"] }],
    ["bathrooms", { type: "integer", types: ["apartment", "house"] }],
    ["floor", { type: "level", types: ["apartment"] }],
    ["total_floors", { type: "integer", types: ["apartment", "house"] }],
    ["partitioning", { type: "code", types: ["apartment"], values: [{ code: "detached" }, { code: "semi_detached" }] }],
    ["attic", { type: "code", types: ["house"], values: [{ code: "attic" }, { code: "none" }] }],
    ["heating_types", { type: "codes", types: ["apartment", "house"], values: [{ code: "gas" }, { code: "district" }] }],
    ["energy_certificate", { type: "code", types: ["apartment", "house"], values: [{ code: "a" }, { code: "b" }] }],
    ["condition", { type: "code", types: ["apartment", "house"], values: [{ code: "renovated" }] }],
    ["flood_risk", { type: "boolean", types: ["house", "land"] }],
    ["land_classification", { type: "code", types: ["land"], values: [{ code: "inside_built_up_area" }] }],
  ]),
  features: [
    { code: "elevator", types: ["apartment"] },
    { code: "intercom", types: null },
    { code: "garden", types: ["house"] },
  ],
  retired: [{ kind: "feature", code: "intercom", replaced_by: "intercom_v2" }, { kind: "feature", code: "unused_code", replaced_by: "x" }],
  withdrawn: [],
};

const ID = "11111111-2222-3333-4444-555555555555";
function prop(over: Partial<HouseraMapperProperty> = {}): HouseraMapperProperty {
  return {
    id: ID, property_type: "apartment", category: null, destination: null, for_sale: true, for_rent: false,
    title: "Apartament 3 camere Copou, renovat", description: "Apartament luminos cu trei camere, renovat complet în 2022, aproape de parc.",
    lat: 47.1752, lng: 27.5701, city: "Iași", county: "Iași", district: "Copou", street: "Strada Vasile Lupu", street_number: "12",
    postal_code: "700123", price: 120000, currency: "EUR", sale_price: 125000, sale_currency: "EUR", rent_price: 600, rent_currency: "EUR",
    negotiable: true, usable_surface: 72.456, surface: null, built_surface: 80, land_surface: null, balcony_surface: 6,
    terrace_surface: null, garden_surface: 20, rooms: 3, bedrooms: 2, bathrooms: 1, floor: 3, building_floors: 8, layout: "Decomandat",
    build_year: 1985, has_attic: false, heating: null, heating_systems: ["Centrală proprie", "Calorifere"], energy_class: "A",
    finish_state: "Renovat", features: ["Necunoscut"], building_amenities: ["Lift", "Interfon"], appliances: [], misc_features: [],
    utilities: [], views: [], cooling_systems: [], additional_spaces: [], parking: null, bathroom_window: false, ...over,
  };
}

describe("mapPropertyToHousera", () => {
  it("apartament de vânzare complet", () => {
    const r = mapPropertyToHousera(prop(), schema, { agentEmail: "agent@agentie.ro" });
    expect(r.errors).toEqual([]);
    expect(r.listings).toHaveLength(1);
    expect(r.listings[0].payload).toEqual({
      type: "apartment", subtype: "standard", transaction: "sale",
      title: "Apartament 3 camere Copou, renovat", description: prop().description, content_locale: "ro",
      latitude: 47.1752, longitude: 27.5701, city: "Iași", street: "Strada Vasile Lupu", street_number: "12",
      county: "Iași", area: "Copou", postal_code: "700123", country: "RO",
      price: 125000, price_currency: "EUR", negotiable: true,
      usable_area_sqm: 72.46, built_area_sqm: 80, surface_balconies: 6,
      rooms: 3, bedrooms: 2, bathrooms: 1, floor: 3, total_floors: 8, partitioning: "detached", year_built: 1985,
      heating_types: ["gas"], energy_certificate: "a", condition: "renovated",
      features: ["elevator", "intercom"], agent: "agent@agentie.ro",
    });
    expect(r.listings[0].payload).not.toHaveProperty("contact_phone");
    expect(r.listings[0].payload).not.toHaveProperty("contact_as");
  });

  it("vânzare + închiriere → două payload-uri cu ref-uri diferite", () => {
    const r = mapPropertyToHousera(prop({ for_rent: true }), schema, { agentEmail: "a@b.ro" });
    expect(r.listings.map((l) => l.externalRef)).toEqual([`${ID}-sale`, `${ID}-rent`]);
    expect(r.listings.map((l) => [l.payload["transaction"], l.payload["price"]])).toEqual([["sale", 125000], ["rent", 600]]);
    for (const l of r.listings) expect(l.externalRef).toMatch(/^[A-Za-z0-9._:/-]{1,100}$/);
  });

  it("descriere cu telefon/email/link → curățată, cu avertisment", () => {
    const description = "Apartament superb, sunați la 0722 123 456 sau scrieți la contact@agentie.ro. Detalii pe www.agentie.ro/oferta. Preț 125.000 EUR.";
    const r = mapPropertyToHousera(prop({ description }), schema, { agentEmail: "a@b.ro" });
    const d = String(r.listings[0].payload["description"]);
    expect(d).not.toMatch(/0722|@|www\.|agentie\.ro/);
    expect(d).toContain("125.000 EUR");
    expect(r.warnings.some((w) => w.includes("date de contact"))).toBe(true);
  });

  it("casă fără flood_risk → eroare blocantă", () => {
    const r = mapPropertyToHousera(prop({ property_type: "house", category: "Vilă", land_surface: 300, floor: null }), schema, { agentEmail: "a@b.ro" });
    expect(r.errors).toContain("Declarația de risc de inundație lipsește (Habitoo nu are acest câmp).");
    expect(r.listings[0].payload).not.toHaveProperty("flood_risk");
  });

  it("fără coordonate → eroare blocantă", () => {
    const r = mapPropertyToHousera(prop({ lat: null, lng: null }), schema, { agentEmail: "a@b.ro" });
    expect(r.errors).toContain("Coordonatele (latitudine/longitudine) lipsesc.");
  });

  it("etaj 0 → floor 0", () => {
    const r = mapPropertyToHousera(prop({ floor: 0 }), schema, { agentEmail: "a@b.ro" });
    expect(r.listings[0].payload["floor"]).toBe(0);
    expect(r.errors).toEqual([]);
  });

  it("casă fără subtip sigur → eroare, nu ghicim", () => {
    const r = mapPropertyToHousera(prop({ property_type: "house" }), schema, { agentEmail: null });
    expect(r.errors.some((e) => e.startsWith("Subtipul casei lipsește"))).toBe(true);
  });
});

describe("nomenclator", () => {
  it("semnalează doar codurile retrase folosite în mapare", () => {
    expect(houseraAffectedCodes(schema).retired.map((r) => r.code)).toEqual(["intercom"]);
  });
  it("trimite If-None-Match și tratează 304 ca neschimbat", async () => {
    const f = vi.fn(async () => new Response(null, { status: 304 }));
    const r = await fetchHouseraSchema({ env: { HOUSERA_ENV: "staging" }, etag: 'W/"abc"', fetch: f as unknown as typeof fetch });
    expect(r.status).toBe("unchanged");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://staging.housera.ro/api/v1/schema?locale=ro");
    expect((init.headers as Record<string, string>)["If-None-Match"]).toBe('W/"abc"');
  });
  it("stripHouseraContacts păstrează prețuri și ani", () => {
    expect(stripHouseraContacts("Construit în 1985, preț 125.000 EUR").removed).toEqual([]);
  });
});

describe("streetFromAddress (H3.1)", () => {
  it.each([
    ["tineretului 79", "Tineretului", "79"],
    ["tineretului nr 13", "Tineretului", "13"],
    ["tineretului 35 bis", "Tineretului", "35 bis"],
    ["Str. Mihai Eminescu nr. 5, Sector 1", "Strada Mihai Eminescu", "5"],
    ["Bd. Iuliu Maniu 7A", "Bulevardul Iuliu Maniu", "7A"],
  ])("%s", (address, street, number) => {
    expect(streetFromAddress(address)).toEqual({ street, number });
    const r = mapPropertyToHousera(prop({ street: null, street_number: null, address }), schema, { agentEmail: null });
    expect(r.listings[0].payload.street).toBe(street);
    expect(r.listings[0].payload.street_number).toBe(number);
    expect(r.warnings).toContain(`Strada a fost preluată din adresă: «${street}» nr. «${number}». Verifică.`);
  });

  it("adresă goală → eroarea rămâne", () => {
    const r = mapPropertyToHousera(prop({ street: null, street_number: null, address: "" }), schema, { agentEmail: null });
    expect(r.errors).toContain("Strada lipsește.");
  });

  it("street completat → adresa nu se folosește", () => {
    const r = mapPropertyToHousera(prop({ address: "Bd. Iuliu Maniu 7A" }), schema, { agentEmail: null });
    expect(r.listings[0].payload.street).toBe("Strada Vasile Lupu");
    expect(r.listings[0].payload.street_number).toBe("12");
    expect(r.warnings.some((w) => w.startsWith("Strada a fost preluată"))).toBe(false);
  });
});
