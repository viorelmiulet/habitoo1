import { describe, expect, it } from "vitest";
import { houseTypeOptions } from "@/lib/property-taxonomy";
import { PROPERTY_DETAIL_FIELDS } from "@/lib/property-detail-fields";
import { mapPartnerListing } from "@/lib/partner-api/schema";
import type { PropertyRow } from "@/lib/site-feed/mapper";
import { mapPropertyToVrexa } from "./vrexa/mapper";
import { houseraTypeFor, mapPropertyToHousera, type HouseraMapperProperty } from "./housera/mapper";
import type { HouseraSchema } from "./housera/schema";

const house = {
  id: "11111111-1111-1111-1111-111111111111", organization_id: "org", property_type: "house",
  title: "Casă individuală cu grădină", description: "Casă luminoasă cu patru camere și grădină, aproape de parc, renovată complet.",
  for_sale: true, for_rent: false, sale_price: 120000, sale_currency: "EUR", status: "active",
  street: "Strada Lalelelor", street_number: "5", city: "București", county: "București", district: "Militari",
  lat: 44.43, lng: 26.02, location_precise: true, commission: "2%", utilities: ["Apă", "Gaz"],
  heating_systems: ["Centrală proprie"], cooling_systems: [], furnishing: "Complet", finish_state: "Renovat",
  build_year: 2000, bathrooms: 1, rooms: 4, building_floors: 2, land_surface: 400, usable_surface: 150,
  features: [], building_amenities: [], appliances: [], misc_features: [], views: [], additional_spaces: [], flood_risk: false,
};
const context = { agent: { name: "Ana", email: "agent@example.test", phone: "0722123456" } };
// House codes from the cached GET /schema?locale=ro vocabulary, not invented aliases.
const houseraHouseCodes = ["detached", "duplex", "terraced", "villa", "mansion", "semi_detached", "triplex"];
const schema: HouseraSchema = {
  types: [{ code: "house", transactions: ["sale", "rent"], subtypes: houseraHouseCodes.map(code => ({ code })) }],
  currencies: ["EUR", "RON"], features: [], fields: {},
};
const mappings = [
  ["Individuală", "detached", "detached"], ["Cuplată", "semiDetached", "semi_detached"],
  ["Înșiruită", "terraced", "terraced"], ["Duplex", "duplex", "duplex"], ["Triplex", "triplex", "triplex"],
  ["Bungalow", "bungalow", null], ["Conac", "mansion", "mansion"], ["Cabană", "cottage", null], ["Fermă", "farmhouse", null],
] as const;

describe("Tip casă — salvare și portaluri", () => {
  it("toate cele nouă valori sunt în formular și category este în patch-ul de editare", () => {
    expect(houseTypeOptions).toEqual(mappings.map(([label]) => label));
    expect(PROPERTY_DETAIL_FIELDS.filter(field => field === "category")).toEqual(["category"]);
  });
  it.each(mappings)("%s produce houseType %s în Vrexa", (category, expected) => {
    const result = mapPropertyToVrexa({ ...house, category }, context);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reasons.join(" "));
    expect(result.listings[0]?.body["houseType"]).toBe(expected);
  });
  it.each(mappings)("%s are corespondent Housera %s sau refuz explicit", (category, _vrexa, expected) => {
    for (const property_type of ["house", "villa"]) {
      const row = { ...house, property_type, category } as unknown as HouseraMapperProperty;
      const type = houseraTypeFor(row);
      const result = mapPropertyToHousera(row, schema, { agentEmail: "agent@example.test" });
      expect(type.subtype).toBe(expected);
      if (expected) {
        expect(houseraHouseCodes).toContain(expected);
        expect(result.listings[0]?.payload["subtype"]).toBe(expected);
        expect(type.error).toBeUndefined();
      } else {
        expect(type.error).toContain(`„${category}”`);
        expect(result.errors).toContain(type.error);
        expect(result.listings[0]?.payload).not.toHaveProperty("subtype");
      }
    }
  });
  it("category gol rămâne opțional în Habitoo, dar blochează Vrexa pentru acest motiv", () => {
    const result = mapPropertyToVrexa({ ...house, category: null }, context);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Trebuia refuzat de Vrexa");
    expect(result.reasons.some(reason => reason.includes("tipul casei"))).toBe(true);
  });
  it.each(mappings)("%s ajunge în property_subtype existent din Partner API", (category) => {
    const result = mapPartnerListing({ ...house, category } as unknown as PropertyRow, []);
    const expected: Record<string, string> = { "Individuală": "individuala", "Cuplată": "cuplata", "Înșiruită": "insiruita", Duplex: "duplex", Triplex: "triplex", Bungalow: "bungalow", Conac: "conac", "Cabană": "cabana", "Fermă": "ferma" };
    expect(result.property_subtype).toBe(expected[category]);
  });
  it("vilă fără categorie păstrează subtipul Housera existent", () => {
    expect(houseraTypeFor({ ...house, property_type: "villa", category: null } as unknown as HouseraMapperProperty).subtype).toBe("villa");
  });
});