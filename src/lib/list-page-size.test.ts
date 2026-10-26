import { describe, expect, it } from "vitest";
import { chunk, normalizeListPageSize, pageNumbers, pageRangeLabel } from "./list-page-size";
import { privateListingsFiltersSchema } from "./listings.functions";
import { propertyListSearchSchema } from "./property-list-filters";

describe("anunțuri pe pagină", () => {
  it("implicit 15", () => expect(normalizeListPageSize(undefined)).toBe(15));
  it("acceptă doar 15, 50, 100, 200", () => {
    expect([15, 50, 100, 200].map(normalizeListPageSize)).toEqual([15, 50, 100, 200]);
    expect(normalizeListPageSize(25)).toBe(15);
    expect(normalizeListPageSize("200")).toBe(200);
  });
  it("serverul Anunțuri particulari respinge alte mărimi", () => {
    expect(privateListingsFiltersSchema.safeParse({ pageSize: 200 }).success).toBe(true);
    expect(privateListingsFiltersSchema.safeParse({ pageSize: 24 }).success).toBe(false);
  });
  it("URL-ul Proprietăți ignoră mărimi necunoscute", () => {
    expect(propertyListSearchSchema.parse({ perPagina: "100" }).perPagina).toBe(100);
    expect(propertyListSearchSchema.parse({ perPagina: "25" }).perPagina).toBeUndefined();
  });
  it("intervalul afișat", () => {
    expect(pageRangeLabel(2, 50, 1240)).toBe("51–100 din 1.240 rezultate");
    expect(pageRangeLabel(7, 200, 1240)).toBe("1.201–1.240 din 1.240 rezultate");
  });
  it("paginare numerotată", () => {
    expect(pageNumbers(5, 10)).toEqual([1, "…", 4, 5, 6, "…", 10]);
  });
  it("loturi fără pierderi", () => {
    expect(chunk(Array.from({ length: 201 }, (_, i) => i), 50).map((c) => c.length)).toEqual([50, 50, 50, 50, 1]);
  });
});
