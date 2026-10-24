import { describe, expect, it } from "vitest";
import { TRANSACTION_FILTERS, privateListingsFiltersSchema } from "./listings.functions";

describe("Anunțuri particulari — filtrele tip anunț și tip proprietate", () => {
  it("„Închiriere pe zi” caută în tipul anunțului și în descriere", () => {
    expect(TRANSACTION_FILTERS.rent_day).toContain("transaction_type.ilike.%pe zi%");
    expect(TRANSACTION_FILTERS.rent_day).toContain("description.ilike.%pe zi%");
  });

  it("Vânzare și închiriere păstrează filtrele existente", () => {
    expect(TRANSACTION_FILTERS.sale).toContain("transaction_type.ilike.%vanz%");
    expect(TRANSACTION_FILTERS.rent).toContain("transaction_type.ilike.%inch%");
  });

  it("acceptă tipul de anunț „închiriere pe zi”", () => {
    expect(privateListingsFiltersSchema.parse({ transaction: "rent_day" })).toMatchObject({
      transaction: "rent_day",
    });
  });

  it("acceptă tipul de proprietate", () => {
    expect(privateListingsFiltersSchema.parse({ propertyType: "Apartament" })).toMatchObject({
      propertyType: "Apartament",
    });
  });

  it("refuză tipuri de proprietate foarte lungi", () => {
    expect(() => privateListingsFiltersSchema.parse({ propertyType: "x".repeat(81) })).toThrow();
  });

  it("acceptă sortările listei și refuză valori necunoscute", () => {
    expect(privateListingsFiltersSchema.parse({ sort: "price_asc" })).toMatchObject({ sort: "price_asc" });
    expect(() => privateListingsFiltersSchema.parse({ sort: "random" })).toThrow();
  });
});
