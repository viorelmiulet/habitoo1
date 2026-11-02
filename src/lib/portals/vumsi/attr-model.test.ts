import { describe, expect, it } from "vitest";
import { VUMSI_CATEGORY_QUERIES, buildVumsiSnapshot, type VumsiCategory } from "./nomenclature";
import { mapPropertyToVumsi, suggestVumsiCategory, vumsiModelMismatch, type VumsiMappings } from "./mapper";

const cat = (id: number, name: string, attr_model: string | null): VumsiCategory => ({ id, name, path: name, parent: 1, query: "", attr_model });
const CATS = [
  cat(73, "Case - Vile", "attr_real_estate_land"),
  cat(74, "Terenuri", "attr_real_estate_land"),
  cat(80, "Locuinte individuale", "attr_real_estate_house"),
  cat(463, "Depozite - hale - spații industriale", "attr_real_estate_industrial"),
  cat(75, "Birouri - Spatii comerciale", "attr_generic"),
];

describe("Vumsi attr_model", () => {
  it("caută și categoriile industriale", () => {
    for (const q of ["industriale", "hale", "depozite", "spatii industriale"]) expect(VUMSI_CATEGORY_QUERIES).toContain(q as never);
  });

  it("snapshotul salvează attr_model pe categorie și în atribute", async () => {
    const s = await buildVumsiSnapshot(async (path) => {
      if (path === "/reference/") return { ok: true, data: {} };
      if (path === "/categories/") return { ok: true, data: [{ id: 463, name: "Depozite", is_leaf: true, name_with_ancestors: "Imobiliare > Depozite" }] };
      return { ok: true, data: { attr_model: "attr_real_estate_industrial", fields: [{ name: "usable_area", type: "decimal" }] } };
    });
    expect(s.categories[0]!.attr_model).toBe("attr_real_estate_industrial");
    expect(s.attributes["463"]!.attr_model).toBe("attr_real_estate_industrial");
  });

  it("sugestia preferă modelul potrivit", () => {
    expect(suggestVumsiCategory("house", "sale", CATS)?.id).toBe(80);
    expect(suggestVumsiCategory("industrial", "sale", CATS)?.id).toBe(463);
    expect(suggestVumsiCategory("land", "sale", CATS)?.id).toBe(74);
    expect(suggestVumsiCategory("office", "sale", CATS)?.id).toBe(75);
  });

  it("nu sugerează casă cu model de teren", () => {
    expect(suggestVumsiCategory("house", "sale", CATS.filter((c) => c.id !== 80))).toBeNull();
  });

  it("mesajul de blocare pentru casă cu atribute de teren", () => {
    expect(vumsiModelMismatch("house", "attr_real_estate_land")).toBe(
      "Categoria Vumsi aleasă pentru casă/vilă folosește atributele de teren; alege în SuperAdmin → Vumsi categoria cu modelul attr_real_estate_house.",
    );
    expect(vumsiModelMismatch("house", "attr_real_estate_house")).toBeNull();
    expect(vumsiModelMismatch("apartment", "attr_generic")).toBeNull();
  });

  const mappings = (kind: string, id: number): VumsiMappings => ({ categories: [{ habitoo_kind: kind, transaction: "sale", category_id: id, category_name: "X" }], types: [{ transaction: "sale", type_value: 1 }] });
  const prop = (property_type: string) => ({ id: "p1", property_type, transaction_type: "sale", sale_price: 100000, description: "Descriere", usable_surface: 120, built_surface: 140, land_surface: 500, build_year: 2010, bathrooms: 2, bedrooms: 4, parking_spaces: 3 }) as any;

  it("blochează publicarea casei pe categoria cu model de teren", () => {
    const r = mapPropertyToVumsi(prop("house"), { attributes: { "73": { fields: [], attr_model: "attr_real_estate_land" } }, mappings: mappings("house", 73), cityId: 1 });
    expect(r.plans[0]!.body).toBeNull();
    expect(r.reasons.join(" ")).toMatch(/attr_real_estate_house/);
  });

  it("completează atributele de spațiu industrial cunoscute", () => {
    const fields = ["usable_area", "built_area", "land_area", "construction_year", "parking_spots"].map((name) => ({ name, label: null, type: name.includes("year") || name.includes("spots") ? "number" : "decimal", required: false, choices: [] }));
    const r = mapPropertyToVumsi(prop("industrial"), { attributes: { "463": { fields, attr_model: "attr_real_estate_industrial" } }, mappings: mappings("industrial", 463), cityId: 1 });
    expect(r.plans[0]!.attrs).toEqual({ usable_area: 120, built_area: 140, land_area: 500, construction_year: 2010, parking_spots: 3 });
  });
});
