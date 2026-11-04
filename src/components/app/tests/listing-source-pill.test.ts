import { describe, expect, it } from "vitest";
import { listingSourceLogo } from "@/components/app/ListingSourcePill";
import { countActiveFilters, countFilledValues } from "@/lib/filter-count";

describe("listingSourceLogo", () => {
  it("portalurile cu logo folosesc imaginea lor, nu iconul MAP Habitoo", () => {
    for (const s of ["storia", "olx", "imobiliare", "romimo", "imoradar", "anuntul", "homezz", "facebook", "argus"]) {
      expect(listingSourceLogo(s).kind).toBe("image");
    }
  });
  it("iconul MAP Habitoo doar pentru sursa habitoo", () => {
    expect(listingSourceLogo("habitoo")).toEqual({ kind: "habitoo" });
  });
  it("sursă necunoscută: doar numele, fără logo", () => {
    expect(listingSourceLogo("portal-nou")).toEqual({ kind: "none" });
  });
});

describe("Filtre (n)", () => {
  const defaults = { source: "all", city: "", status: "active", priceMin: "", page: 1, sort: "newest", view: "list" };
  it("nu numără pagina, sortarea sau vederea", () => {
    expect(countActiveFilters({ ...defaults, page: 4, sort: "price_asc", view: "cards" }, defaults)).toBe(0);
  });
  it("numără doar filtrele schimbate", () => {
    expect(countActiveFilters({ ...defaults, city: "Cluj", priceMin: "50000", page: 2 }, defaults)).toBe(2);
  });
  it("valorile goale nu sunt filtre", () => {
    expect(countFilledValues(["sale", undefined, "", 0, []])).toBe(2);
  });
});
