import { describe, expect, it } from "vitest";
import {
  constructionStageFor,
  petFriendlyFor,
  resolveOptionId,
  resolveOptionPk,
  resolveOptionPks,
  EMPTY_LACHEIE_CATALOG,
  type LaCheieCatalog,
} from "../catalog";
import { LACHEIE_ALLOWED_FIELDS } from "../mapper";

const catalog: LaCheieCatalog = {
  ...EMPTY_LACHEIE_CATALOG,
  options: {
    comfort: [
      { id: "comfort_1", name: "Confort 1" },
      { id: "comfort_lux", name: "Confort lux" },
    ],
    partitioning: [
      { id: "decomandat", name: "Decomandat" },
      { id: "semidecomandat", name: "Semidecomandat" },
    ],
    construction_stage: [
      { id: "pre_1941", name: "Inainte de 1941" },
      { id: "2011_2019", name: "2011 - 2019" },
      { id: "new_after_2020", name: "Constructie noua (dupa 2020)" },
    ],
    pet_friendly: [
      { id: "allowed", name: "Pet Friendly" },
      { id: "not_allowed", name: "Fara animale de companie" },
    ],
    heating: [
      { id: "1", name: "Centrala termica" },
      { id: "2", name: "Termoficare" },
    ],
    utilities: [
      { id: "1", name: "Electricitate" },
      { id: "2", name: "Apa" },
      { id: "4", name: "Gaze" },
    ],
  },
  fetchedAt: "2026-01-01T00:00:00.000Z",
};

describe("mapare catalog La Cheie", () => {
  it("A. trimite latitude/longitude, nu lat/lng (câmpuri necunoscute la portal)", () => {
    expect(LACHEIE_ALLOWED_FIELDS).toContain("latitude");
    expect(LACHEIE_ALLOWED_FIELDS).toContain("longitude");
    expect(LACHEIE_ALLOWED_FIELDS as readonly string[]).not.toContain("lat");
    expect(LACHEIE_ALLOWED_FIELDS as readonly string[]).not.toContain("lng");
  });

  it("B. rezolvă enum-urile în valorile de catalog, nu în text liber", () => {
    expect(resolveOptionId(catalog, "comfort", "Confort 1")).toBe("comfort_1");
    expect(resolveOptionId(catalog, "comfort", "comfort_lux")).toBe("comfort_lux");
    expect(resolveOptionId(catalog, "partitioning", "Decomandat")).toBe("decomandat");
    expect(resolveOptionId(catalog, "comfort", "1")).toBeNull();
    expect(resolveOptionId(catalog, "comfort", "inventat")).toBeNull();
  });

  it("C. heating/utilities devin id-uri numerice (pk), nu denumiri", () => {
    expect(resolveOptionPk(catalog, "heating", "Centrala termica")).toBe(1);
    expect(resolveOptionPk(catalog, "heating", "Ceva inexistent")).toBeNull();
    expect(resolveOptionPks(catalog, "utilities", ["Apa", "Gaze", "Apa", "Inexistent"])).toEqual([
      2, 4,
    ]);
  });

  it("D. construction_stage derivă din anul construcției, doar dacă există în catalog", () => {
    expect(constructionStageFor(catalog, 2016)).toBe("2011_2019");
    expect(constructionStageFor(catalog, 1930)).toBe("pre_1941");
    expect(constructionStageFor(catalog, 2024)).toBe("new_after_2020");
    expect(constructionStageFor(catalog, 1995)).toBeNull();
    expect(constructionStageFor(catalog, null)).toBeNull();
  });

  it("E. pet_friendly este alegere de catalog, nu boolean", () => {
    expect(petFriendlyFor(catalog, true)).toBe("allowed");
    expect(petFriendlyFor(catalog, false)).toBe("not_allowed");
    expect(petFriendlyFor(catalog, null)).toBeNull();
    expect(petFriendlyFor(EMPTY_LACHEIE_CATALOG, true)).toBeNull();
  });

  it("F. fără catalog sincronizat nu se ghicește nicio valoare", () => {
    expect(resolveOptionId(EMPTY_LACHEIE_CATALOG, "comfort", "Confort 1")).toBeNull();
    expect(resolveOptionPks(EMPTY_LACHEIE_CATALOG, "utilities", ["Apa"])).toEqual([]);
  });
});

describe("erori de validare La Cheie", () => {
  it("G. expune câmpurile exacte refuzate de portal", async () => {
    const { describeLaCheieValidation } = await import("../http");
    expect(
      describeLaCheieValidation({
        error: {
          code: "validation_error",
          fields: { lat: ["Unknown field."], comfort: ['"1" is not a valid choice.'] },
        },
      }),
    ).toBe('lat: Unknown field.; comfort: "1" is not a valid choice.');
    expect(describeLaCheieValidation({ error: { code: "validation_error" } })).toBeNull();
    expect(describeLaCheieValidation(null)).toBeNull();
  });
});
