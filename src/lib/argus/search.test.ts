/**
 * Traducerea filtrelor și normalizarea răspunsurilor Argus (pasul 2).
 * Răspunsuri simulate — niciun apel real la Argus.
 */
import { describe, expect, it } from "vitest";
import {
  ARGUS_CACHE_MS,
  ARGUS_LISTED_BY_OWNER,
  buildArgusSearchBody,
  normalizeArgusContact,
  normalizeArgusDetail,
  normalizeArgusPlacesPage,
  normalizeArgusPropertyTypes,
  normalizeArgusSearch,
} from "./search.shared";

describe("buildArgusSearchBody", () => {
  it("implicit trimite doar anunțuri de la proprietari (listed_by = 1)", () => {
    expect(buildArgusSearchBody({})).toEqual({ page: 1, listed_by: [ARGUS_LISTED_BY_OWNER] });
  });

  it("opțiunea „Toți” omite filtrul listed_by", () => {
    const body = buildArgusSearchBody({ listedBy: "all" });
    expect(body).not.toHaveProperty("listed_by");
  });

  it("traduce tranzacția: vânzare = 1, închiriere = 2", () => {
    expect(buildArgusSearchBody({ transaction: "sale" })["transaction_type"]).toEqual([1]);
    expect(buildArgusSearchBody({ transaction: "rent" })["transaction_type"]).toEqual([2]);
  });

  it("traduce județul, localitatea și zonele în counties/cities/areas", () => {
    const body = buildArgusSearchBody({ countyId: 40, cityId: 17913, areaIds: [1, 2] });
    expect(body["counties"]).toEqual([40]);
    expect(body["cities"]).toEqual([17913]);
    expect(body["areas"]).toEqual([1, 2]);
  });

  it("traduce prețul și suprafața în intervale [min, max]", () => {
    const body = buildArgusSearchBody({ priceMin: 50000, priceMax: 90000, surfaceMin: 40 });
    expect(body["budget"]).toEqual([50000, 90000]);
    expect(body["surface"]).toEqual([40, 0]);
  });

  it("trimite pagina și camerele sortate", () => {
    const body = buildArgusSearchBody({ page: 3, rooms: [3, 1] });
    expect(body["page"]).toBe(3);
    expect(body["rooms"]).toEqual([1, 3]);
  });
});

const SEARCH_ITEM = {
  property_id: "AXX5ADxvdbxpjSS-D3Pe",
  title: "apartament 2 camere, proprietar",
  last_price: 75000,
  last_date: "2026-10-24 09:15:00",
  last_source_name: "romimo.ro",
  last_site_link: "https://www.romimo.ro/anunt.html",
  listed_by_label: "Proprietar",
  transaction_label: "Vanzare",
  property_type_label: "Apartament",
  has_image: true,
  details: { rooms: 2, living_area: 52, year_built: 2008, floors_number_text: "3" },
  location: { county: "București", city: "București", area: "Titan", position: { lat: "44.42", lon: "26.15" } },
  phone_numbers: ["+40 700 000 000"],
};

describe("normalizeArgusSearch", () => {
  it("mapează câmpurile cardului și elimină telefoanele", () => {
    const result = normalizeArgusSearch({ properties: [SEARCH_ITEM], total: 128 });
    expect(result.total).toBe(128);
    expect(result.items).toHaveLength(1);
    const card = result.items[0]!;
    expect(card).toMatchObject({
      id: "AXX5ADxvdbxpjSS-D3Pe",
      title: "apartament 2 camere, proprietar",
      price: 75000,
      rooms: 2,
      surface: 52,
      city: "București",
      area: "Titan",
      sourceName: "romimo.ro",
      url: "https://www.romimo.ro/anunt.html",
      date: "2026-10-24T09:15:00",
      hasImage: true,
    });
    expect(JSON.stringify(result)).not.toContain("700 000");
    expect(card).not.toHaveProperty("phone_numbers");
  });

  it("sare peste intrările fără property_id", () => {
    const result = normalizeArgusSearch({ properties: [{ title: "fără id" }, SEARCH_ITEM], total: 2 });
    expect(result.items).toHaveLength(1);
  });
});

describe("normalizeArgusDetail", () => {
  it("include descrierea, pozele, poziția și linkul original, fără telefoane", () => {
    const detail = normalizeArgusDetail({
      ...SEARCH_ITEM,
      description: "Descriere completă",
      images: [{ File: "https://cdn.argus.me/1.jpg", Thumb: "https://cdn.argus.me/1_80.jpg" }],
    });
    expect(detail).toMatchObject({
      description: "Descriere completă",
      position: { lat: 44.42, lon: 26.15 },
      url: "https://www.romimo.ro/anunt.html",
    });
    expect(detail?.images).toEqual([{ full: "https://cdn.argus.me/1.jpg", thumb: "https://cdn.argus.me/1_80.jpg" }]);
    expect(detail?.details).toMatchObject({ rooms: 2, living_area: 52, year_built: 2008 });
    expect(JSON.stringify(detail)).not.toContain("700 000");
  });
});

describe("normalizeArgusContact", () => {
  it("telefonul vine doar din răspunsul /properties/contact", () => {
    expect(normalizeArgusContact({ phone_numbers: ["+40 700 000 000", "  "] })).toEqual({
      phones: ["+40 700 000 000"],
    });
    expect(normalizeArgusContact({})).toEqual({ phones: [] });
  });
});

describe("localizare și taxonomii", () => {
  it("normalizează o pagină de județe cu next_page", () => {
    const page = normalizeArgusPlacesPage({
      result: [
        { id: 1, name: "Alba", name_short: "AB" },
        { id: 40, name: "București", name_short: "B" },
      ],
      total_count: 42,
      next_page: 2,
    });
    expect(page.options).toEqual([
      { id: 1, name: "Alba" },
      { id: 40, name: "București" },
    ]);
    expect(page.nextPage).toBe(2);
  });

  it("păstrează doar tipurile de proprietate de nivel superior", () => {
    const types = normalizeArgusPropertyTypes([
      { property_type: 1, property_sub_type: 0, label: "Studio", label_utf: "Garsonieră" },
      { property_type: 2, property_sub_type: 0, label: "Apartament", label_utf: "Apartament" },
      { property_type: 2, property_sub_type: 21, label: "Duplex", label_utf: "Duplex" },
    ]);
    expect(types).toEqual([
      { id: 1, label: "Garsonieră" },
      { id: 2, label: "Apartament" },
    ]);
  });
});

describe("cache-ul căutărilor", () => {
  it("aceeași căutare repetată în 5 minute se ia din cache", () => {
    expect(ARGUS_CACHE_MS).toBe(5 * 60_000);
  });
});
