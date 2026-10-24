import { describe, expect, it } from "vitest";
import { PRIVATE_LISTINGS_ORDER, PRIVATE_LISTINGS_PAGE_SIZE, cleanText, keywordTerms, normalizeRooms } from "./private-listings";

describe("filtre anunțuri particulari", () => {
  it("pagina are 24 de anunțuri, afișate pe rânduri", () => {
    expect(PRIVATE_LISTINGS_PAGE_SIZE).toBe(24);
  });
  it("sortările disponibile au o ordonare definită", () => {
    expect(PRIVATE_LISTINGS_ORDER.newest).toEqual({ column: "scraped_at", ascending: false });
    expect(PRIVATE_LISTINGS_ORDER.price_asc).toEqual({ column: "price", ascending: true });
    expect(PRIVATE_LISTINGS_ORDER.price_desc).toEqual({ column: "price", ascending: false });
    expect(PRIVATE_LISTINGS_ORDER.surface_desc).toEqual({ column: "surface", ascending: false });
  });
  it("cuvintele cheie elimină caracterele speciale", () => {
    expect(keywordTerms("centrală, parcare%(x)")).toEqual(["centrală", "parcare"]);
  });
  it("camerele acceptă 1–5 fără duplicate", () => {
    expect(normalizeRooms([3, 1, 3, 7, 0])).toEqual([1, 3]);
  });
  it("orașul gol devine nefiltrat", () => {
    expect(cleanText("  ")).toBeUndefined();
  });
});
