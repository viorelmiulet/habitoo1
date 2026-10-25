import { describe, expect, it } from "vitest";
import { privateListingsFiltersSchema } from "./listings.functions";

describe("Anunțuri particulari — filtrul de sursă", () => {
  it("acceptă sursa imoradar", () => {
    expect(privateListingsFiltersSchema.parse({ source: "imoradar" })).toMatchObject({ source: "imoradar" });
  });
  it("acceptă sursa romimo", () => {
    expect(privateListingsFiltersSchema.parse({ source: "romimo" })).toMatchObject({ source: "romimo" });
  });
  it("acceptă sursa anuntul", () => {
    expect(privateListingsFiltersSchema.parse({ source: "anuntul" })).toMatchObject({ source: "anuntul" });
  });

  it("acceptă sursele istorice storia, imobiliare și olx", () => {
    for (const source of ["storia", "imobiliare", "olx"]) {
      expect(privateListingsFiltersSchema.parse({ source })).toMatchObject({ source });
    }
  });

  it("refuză surse necunoscute", () => {
    expect(() => privateListingsFiltersSchema.parse({ source: "imobiliaremilitari" })).toThrow();
  });
});
