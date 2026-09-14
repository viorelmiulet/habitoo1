/**
 * Teste pentru deduplicarea deterministă: fiecare nivel în ordine, gruparea
 * duplicatelor și faptul că nimic nu se pierde.
 */
import { describe, expect, it } from "vitest";
import { dedupeProspects, titleSimilarity, type DedupeItem } from "../dedupe";

function item(key: string, overrides: Partial<DedupeItem["prospect"]> = {}): DedupeItem {
  return {
    key,
    prospect: {
      sourceKey: "src-1",
      externalId: null,
      canonicalUrl: null,
      sellerPhone: null,
      contentHash: `hash-${key}`,
      city: "București",
      rooms: 2,
      surfaceUseful: 54,
      price: 85000,
      title: `Apartament 2 camere ${key}`,
      sellerName: null,
      ...overrides,
    },
  };
}

describe("dedupeProspects", () => {
  it("detectează duplicatul prin sursă + external_id", () => {
    const result = dedupeProspects([item("a", { externalId: "X1" }), item("b", { externalId: "X1" })]);
    expect(result.decisions[1]).toMatchObject({ duplicate: true, level: "external_id", groupKey: "a" });
    expect(result.duplicates).toBe(1);
  });

  it("detectează duplicatul prin URL canonic", () => {
    const url = "https://example.ro/anunt/9";
    const result = dedupeProspects([item("a", { canonicalUrl: url }), item("b", { canonicalUrl: url })]);
    expect(result.decisions[1]?.level).toBe("canonical_url");
  });

  it("detectează duplicatul prin telefon normalizat", () => {
    const result = dedupeProspects([
      item("a", { sellerPhone: "+40722333444", title: "Ceva complet diferit aici" }),
      item("b", { sellerPhone: "+40722333444", title: "Alt titlu, alt oraș total" }),
    ]);
    expect(result.decisions[1]?.level).toBe("phone");
  });

  it("detectează duplicatul prin content hash", () => {
    const result = dedupeProspects([
      item("a", { contentHash: "same" }),
      item("b", { contentHash: "same", title: "Titlu diferit complet" }),
    ]);
    expect(result.decisions[1]?.level).toBe("content_hash");
  });

  it("detectează duplicatul prin combinația normalizată", () => {
    const result = dedupeProspects([
      item("a", { sellerName: "Ion Popescu", title: "Primul titlu unic aici" }),
      item("b", { sellerName: "ION POPESCU", title: "Alt titlu foarte diferit" }),
    ]);
    expect(result.decisions[1]?.level).toBe("composite");
  });

  it("folosește potrivirea fuzzy doar ca ultim nivel", () => {
    const result = dedupeProspects([
      item("a", { title: "Apartament 2 camere Militari Residence", rooms: 2, price: 85000 }),
      item("b", {
        title: "Apartament 2 camere Militari Residence lux",
        rooms: 2,
        price: 85500,
        contentHash: "other",
        surfaceUseful: 61,
      }),
    ]);
    expect(result.decisions[1]).toMatchObject({ duplicate: true, level: "fuzzy" });
  });

  it("nu marchează duplicat două anunțuri diferite", () => {
    const result = dedupeProspects([
      item("a", { title: "Apartament 2 camere Militari", city: "București" }),
      item("b", { title: "Casa 5 camere Cluj centru", city: "Cluj-Napoca", price: 300000, contentHash: "z" }),
    ]);
    expect(result.duplicates).toBe(0);
  });

  it("grupează duplicatele și păstrează toți membrii", () => {
    const result = dedupeProspects([
      item("a", { externalId: "X" }),
      item("b", { externalId: "X" }),
      item("c", { externalId: "X" }),
    ]);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.keys).toEqual(["a", "b", "c"]);
    expect(result.decisions).toHaveLength(3);
  });

  it("compară noile prospecte cu cele deja salvate", () => {
    const result = dedupeProspects([item("new-0", { canonicalUrl: "https://x.ro/1" })], [
      item("existing-1", { canonicalUrl: "https://x.ro/1" }),
    ]);
    expect(result.decisions[0]).toMatchObject({ duplicate: true, groupKey: "existing-1" });
  });

  it("calculează similaritatea titlurilor determinist", () => {
    expect(titleSimilarity("apartament doua camere militari", "apartament doua camere militari")).toBe(1);
    expect(titleSimilarity("casa cluj", "teren constanta")).toBe(0);
  });
});
