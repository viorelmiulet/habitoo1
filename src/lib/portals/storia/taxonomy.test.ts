import { describe, expect, it } from "vitest";
import {
  REQUIRED_ATTRIBUTES,
  STORIA_USED_CATEGORIES,
  roomsUrn,
  storiaCategoryUrn,
} from "./taxonomy";
import { STORIA_TAXONOMY_SNAPSHOT, storiaAttributeSpec } from "./taxonomy-snapshot";
import { diffStoriaTaxonomy, normalizeStoriaTaxonomy } from "./taxonomy.server";

describe("taxonomia Storia", () => {
  it("folosește doar categorii confirmate în arborele real", () => {
    for (const category of STORIA_USED_CATEGORIES) {
      expect(STORIA_TAXONOMY_SNAPSHOT[category], category).toBeDefined();
    }
  });

  it("mapează terenul pe categoriile de loturi", () => {
    expect(storiaCategoryUrn("teren", "sale")).toBe("urn:concept:lots-for-sale");
    expect(storiaCategoryUrn("land", "rent")).toBe("urn:concept:lots-for-rent");
  });

  it("nu inventează o categorie de vânzare pentru camere", () => {
    expect(storiaCategoryUrn("camera", "sale")).toBeNull();
    expect(storiaCategoryUrn("camera", "rent")).toBe("urn:concept:rooms-for-rent");
  });

  it("nu declară obligatoriu suprafața terenului la case", () => {
    const required = REQUIRED_ATTRIBUTES["urn:concept:houses-for-sale"] ?? [];
    expect(required).not.toContain("urn:concept:terrain-area-m2");
    expect(required).toContain("urn:concept:market");
    expect(required).toContain("urn:concept:net-area-m2");
  });

  it("cere camere doar la apartamente", () => {
    expect(REQUIRED_ATTRIBUTES["urn:concept:apartments-for-sale"]).toContain(
      "urn:concept:number-of-rooms",
    );
    expect(REQUIRED_ATTRIBUTES["urn:concept:garages-for-rent"]).toEqual([]);
  });

  it("nu conține atributul de preț negociabil (inexistent pe Storia)", () => {
    for (const category of STORIA_USED_CATEGORIES) {
      expect(storiaAttributeSpec(category, "urn:concept:price-negotiable")).toBeNull();
    }
  });

  it("trimite numărul de camere ca URN de concept", () => {
    expect(roomsUrn(3)).toBe("urn:concept:3");
    expect(roomsUrn(12)).toBe("urn:concept:more");
    expect(roomsUrn(0)).toBeNull();
  });

  it("normalizează arborele portalului doar pe categoriile-frunză", () => {
    const tree = normalizeStoriaTaxonomy({
      data: [
        {
          code: "urn:concept:realestate",
          label: "Imobiliare",
          children: [
            {
              code: "urn:concept:apartments-for-sale",
              label: "Apartamente de vânzare",
              attributes: [
                { code: "urn:concept:net-area-m2", type: "input", mandatory: true },
                {
                  code: "urn:concept:market",
                  type: "select",
                  mandatory: true,
                  values: [{ code: "urn:concept:primary" }, { code: "urn:concept:secondary" }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(Object.keys(tree)).toEqual(["urn:concept:apartments-for-sale"]);
    const spec = tree["urn:concept:apartments-for-sale"]?.attributes ?? [];
    expect(spec).toHaveLength(2);
    expect(spec[1]?.values).toEqual(["urn:concept:primary", "urn:concept:secondary"]);
  });

  it("semnalează o categorie dispărută de pe portal", () => {
    const diff = diffStoriaTaxonomy({});
    expect(diff.missingCategories).toContain("urn:concept:apartments-for-sale");
  });

  it("nu raportează diferențe pentru instantaneul curent", () => {
    const diff = diffStoriaTaxonomy(STORIA_TAXONOMY_SNAPSHOT);
    expect(diff.missingCategories).toEqual([]);
    expect(diff.newRequired).toEqual([]);
    expect(diff.noLongerRequired).toEqual([]);
    expect(diff.changedAttributes).toEqual([]);
  });
});
