import { describe, expect, it } from "vitest";
import { cleanText, keywordTerms, normalizeRooms } from "./private-listings";

describe("filtre anunțuri particulari", () => {
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
