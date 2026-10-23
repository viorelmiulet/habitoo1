import { describe, expect, it } from "vitest";
import { PRIVATE_LISTINGS_PAGE_SIZE, cleanText, keywordTerms, normalizeRooms } from "./private-listings";

describe("filtre anunțuri particulari", () => {
  it("pagina are 9 anunțuri, ca scroll-ul să rămână scurt", () => {
    expect(PRIVATE_LISTINGS_PAGE_SIZE).toBe(9);
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
