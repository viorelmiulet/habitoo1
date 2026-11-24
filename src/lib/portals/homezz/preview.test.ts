import { describe, expect, it, vi } from "vitest";
import { buildHomezzPreviewFrom } from "./preview.server";
import { PORTAL_REQUIREMENTS, validatePortalRequirements } from "../requirements";

const apt = {
  id: "11111111-1111-1111-1111-111111111111", title: "Apartament 2 camere Militari",
  description: "Apartament luminos, aproape de metrou, renovat recent, cu vedere deschisă.",
  for_sale: true, sale_price: 100000, sale_currency: "EUR", currency: "EUR", lat: 44.43, lng: 26.03,
  location_precise: true, build_year: 2010, property_type: "apartment", usable_surface: 55, comfort: "1",
  floor_label: "Etaj 2", floor: 2, building_type: "Bloc", finish_state: "Bună", construction_stage: "Finalizată",
  rooms: 2, layout: "Decomandat", bathrooms: 1,
};
const agent = { name: "Ana Pop", phone: "0722111222" };

describe("buildHomezzPreviewFrom", () => {
  it("București → IF/9812, zonă după nume", async () => {
    const cities = vi.fn(async () => [{ id: 9812, name: "Bucuresti", county_code: "IF", lat: 44.43, lng: 26.1 }]);
    const areas = vi.fn(async () => [{ id: 777, name: "Militari", city_id: 9812 }]);
    const r = await buildHomezzPreviewFrom({ ...apt, county: "București", city: "Sector 6", district: "Militari" }, agent, { cities, areas }, 2026);
    expect(cities).toHaveBeenCalledWith("IF");
    expect(areas).toHaveBeenCalledWith(9812);
    expect(r.location).toEqual({ ok: true, cityId: 9812, areaId: 777, areaSource: "name" });
    if (!r.ok) throw new Error(r.reasons.join("|"));
    expect(r.ads[0]!.params).toMatchObject({ city_id: 9812, area: 777, owner_phone: "0722111222" });
  });
  it("localitate lipsă → motiv", async () => {
    const r = await buildHomezzPreviewFrom({ ...apt, county: "Cluj", city: "Florești", district: null }, agent,
      { cities: async () => [], areas: async () => [] }, 2026);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.join(" ")).toMatch(/nu există în nomenclatorul HomeZZ/);
  });
});

describe("PORTAL_REQUIREMENTS.homezz", () => {
  it("folosește motivele mapper-ului", () => {
    expect(PORTAL_REQUIREMENTS.homezz?.mapperReasons).toBeTypeOf("function");
    const res = validatePortalRequirements("homezz", { homezzReasons: ["Completează anul construcției pentru HomeZZ."] } as never);
    expect(JSON.stringify(res)).toContain("Completează anul construcției pentru HomeZZ.");
    expect(res.ok).toBe(false);
    expect(validatePortalRequirements("homezz", { homezzReasons: [] } as never).ok).toBe(true);
  });
});
