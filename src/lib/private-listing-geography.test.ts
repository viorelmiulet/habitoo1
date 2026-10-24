import { describe, expect, it } from "vitest";
import { buildListingFacets, geographyKey, localityScope, zoneFilter, type GeographyRow } from "./private-listing-geography";
const row = (patch: Partial<GeographyRow>): GeographyRow => ({ county: "București", city: "București", zone: null, neighborhood: null, ...patch });
describe("Private listing location filters", () => {
  it("merges 173 Sector 1 and 11 Sectorul 1 into one option with 184 offers", () => {
    const rows = [...Array.from({ length: 173 }, () => row({ zone: "Sector 1" })), ...Array.from({ length: 11 }, () => row({ zone: "Sectorul 1" }))];
    expect(buildListingFacets(rows).zones[localityScope("București", "București")]).toEqual([{ value: "sector 1", label: "Sector 1", count: 184, kind: "sector" }]);
  });
  it("Titan finds lower-case titan too", () => {
    const facets = buildListingFacets([row({ neighborhood: "Titan" }), row({ neighborhood: "titan" })]);
    expect(facets.zones[localityScope("București", "București")]).toEqual([{ value: "titan", label: "Titan", count: 2, kind: "neighborhood" }]);
    expect(zoneFilter("Titan")).toEqual({ column: "neighborhood_key", value: "titan" });
  });
  it("Ilfov groups Chiajna and Popești-Leordeni, ordered by offer count", () => {
    const facets = buildListingFacets([row({ county: "Ilfov", city: "Chiajna" }), row({ county: "Ilfov", city: "Popești-Leordeni" }), row({ county: "Ilfov", city: "Chiajna" })]);
    expect(facets.localities.ilfov.map((p) => [p.label,p.count])).toEqual([["Chiajna",2],["Popești-Leordeni",1]]);
    expect(facets.localities.bucuresti).toBeUndefined();
  });
  it("county-only Mehedinți never becomes a city option", () => {
    const facets = buildListingFacets([row({ city: null, county: "Mehedinți" })]);
    expect(facets.counties[0]?.label).toBe("Mehedinți");
    expect(facets.localities.mehedinti).toBeUndefined();
  });
  it("legacy city/zone links and accent variants share normalized keys", () => {
    expect(localityScope(null,"BUCURESTI")).toBe(localityScope(null,"București"));
    expect(zoneFilter("Sectorul 1")).toEqual({ column: "zone_key", value: "sector 1" });
    expect(geographyKey("Mănăștur")).toBe(geographyKey("manastur"));
  });
  it("places București first and includes neighborhoods outside the capital", () => {
    const facets = buildListingFacets([row({ city: "Cluj-Napoca", county: "Cluj", neighborhood: "Mănăștur" }),row({})]);
    expect(facets.counties[0]?.label).toBe("București");
    expect(facets.zones[localityScope("Cluj","Cluj-Napoca")][0]?.label).toBe("Mănăștur");
  });
});