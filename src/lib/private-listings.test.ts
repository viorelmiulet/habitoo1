import { describe, expect, it } from "vitest";
import {
  PRIVATE_LISTINGS_CATEGORIES,
  PRIVATE_LISTINGS_CATEGORY_FILTERS,
  PRIVATE_LISTINGS_ORDER,
  PRIVATE_LISTINGS_PAGE_SIZE,
  PRIVATE_LISTINGS_SOURCE_CYCLE,
  cleanText,
  daysCutoff,
  interleaveNewest,
  keywordTerms,
  normalizeRooms,
  romaniaTodayStart,
} from "./private-listings";
import {
  buildListingFacets,
  filterPlaceOptions,
  firstIndexForLetter,
  type GeographyRow,
  type PlaceOption,
} from "./private-listing-geography";

describe("filtre anunțuri particulari", () => {
  it("pagina are 24 de anunțuri, afișate pe rânduri", () => {
    expect(PRIVATE_LISTINGS_PAGE_SIZE).toBe(24);
  });
  it("sortările după preț și suprafață au o ordonare definită în baza de date", () => {
    expect(PRIVATE_LISTINGS_ORDER.price_asc).toEqual({ column: "price", ascending: true });
    expect(PRIVATE_LISTINGS_ORDER.price_desc).toEqual({ column: "price", ascending: false });
    expect(PRIVATE_LISTINGS_ORDER.surface_desc).toEqual({ column: "surface", ascending: false });
    expect("newest" in PRIVATE_LISTINGS_ORDER).toBe(false);
  });
  it("ciclul de intercalare începe cu Storia, Romimo, OLX, Imoradar24", () => {
    expect(PRIVATE_LISTINGS_SOURCE_CYCLE).toEqual(["storia", "romimo", "olx", "imoradar", "imobiliare", "anuntul", "facebook"]);
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

describe("interleaveNewest", () => {
  const row = (id: string, source: string, at: string | null) => ({ id, source, first_seen_at: at });

  it("intercalează sursele în aceeași zi, în ordinea ciclului", () => {
    const rows = [
      row("s1", "storia", "2026-10-24T08:00:00Z"),
      row("s2", "storia", "2026-10-24T07:00:00Z"),
      row("r1", "romimo", "2026-10-24T09:00:00Z"),
      row("r2", "romimo", "2026-10-24T06:00:00Z"),
      row("o1", "olx", "2026-10-24T05:00:00Z"),
      row("i1", "imoradar", "2026-10-24T04:00:00Z"),
    ];
    expect(interleaveNewest(rows).map((r) => r.id)).toEqual(["s1", "r1", "o1", "i1", "s2", "r2"]);
  });

  it("în interiorul unei surse, cel mai recent anunț din zi vine primul", () => {
    const rows = [
      row("s-old", "storia", "2026-10-24T06:00:00Z"),
      row("s-new", "storia", "2026-10-24T10:00:00Z"),
    ];
    expect(interleaveNewest(rows).map((r) => r.id)).toEqual(["s-new", "s-old"]);
  });

  it("ziua mai recentă vine înaintea zilei mai vechi, fără amestec între zile", () => {
    const rows = [
      row("old-s", "storia", "2026-10-23T23:00:00Z"),
      row("new-r", "romimo", "2026-10-24T01:00:00Z"),
      row("new-s", "storia", "2026-10-24T02:00:00Z"),
    ];
    expect(interleaveNewest(rows).map((r) => r.id)).toEqual(["new-s", "new-r", "old-s"]);
  });

  it("o sursă necunoscută vine după ciclul cunoscut, iar ziua lipsă la final", () => {
    const rows = [
      row("x1", "altportal", "2026-10-24T09:00:00Z"),
      row("s1", "storia", "2026-10-24T08:00:00Z"),
      row("n1", "olx", null),
    ];
    expect(interleaveNewest(rows).map((r) => r.id)).toEqual(["s1", "x1", "n1"]);
  });

  it("cu o singură sursă, ordinea rămâne cea cronologică", () => {
    const rows = [
      row("r1", "romimo", "2026-10-24T08:00:00Z"),
      row("r2", "romimo", "2026-10-24T09:00:00Z"),
      row("r3", "romimo", "2026-10-23T09:00:00Z"),
    ];
    expect(interleaveNewest(rows).map((r) => r.id)).toEqual(["r2", "r1", "r3"]);
  });
});

describe("zile în piață și categorii", () => {
  // 25 oct 2026, 07:38 UTC = 09:38 în România (ora de iarnă, UTC+2 — schimbarea a fost în aceeași noapte).
  const now = new Date("2026-10-25T07:38:00Z");

  it("ziua curentă în România începe la miezul nopții locale", () => {
    expect(romaniaTodayStart(now).toISOString()).toBe("2026-10-24T22:00:00.000Z");
  });

  it("De azi pornește de la începutul zilei de azi", () => {
    expect(daysCutoff(0, now)).toBe("2026-10-24T22:00:00.000Z");
  });

  it("Ultimele 2 zile include și ziua de ieri", () => {
    expect(daysCutoff(2, now)).toBe("2026-10-23T22:00:00.000Z");
    expect(daysCutoff(7, now)).toBe("2026-10-18T22:00:00.000Z");
  });

  it("categoriile acoperă Apartament, Casă, comerciale și Teren", () => {
    expect(PRIVATE_LISTINGS_CATEGORIES).toEqual(["apartamente", "case", "comerciale", "terenuri"]);
    expect(PRIVATE_LISTINGS_CATEGORY_FILTERS.apartamente).toContain("apart");
    expect(PRIVATE_LISTINGS_CATEGORY_FILTERS.case).toContain("cas");
    expect(PRIVATE_LISTINGS_CATEGORY_FILTERS.comerciale).toContain("comercial");
    expect(PRIVATE_LISTINGS_CATEGORY_FILTERS.comerciale).toContain("birou");
    expect(PRIVATE_LISTINGS_CATEGORY_FILTERS.comerciale).toContain("garaj");
    expect(PRIVATE_LISTINGS_CATEGORY_FILTERS.terenuri).toContain("teren");
  });
});

describe("căutarea în listele de localizare și fereastra Alege zone", () => {
  const counties: PlaceOption[] = [
    { value: "bucuresti", label: "București", count: 700 },
    { value: "cluj", label: "Cluj", count: 120 },
    { value: "constanta", label: "Constanța", count: 80 },
  ];
  const zones: PlaceOption[] = [
    { value: "aviatiei", label: "Aviației", count: 5, kind: "neighborhood" },
    { value: "militari", label: "Militari", count: 40, kind: "neighborhood", sector: "sector 6" },
    { value: "marasti", label: "Mărăști", count: 12, kind: "neighborhood" },
    { value: "titan", label: "Titan", count: 49, kind: "neighborhood", sector: "sector 3" },
  ];

  it("cl in Judet arata Cluj, fara derulare", () => {
    expect(filterPlaceOptions(counties, "cl").map((o) => o.label)).toEqual(["Cluj"]);
  });

  it("căutarea ignoră diacriticele", () => {
    expect(filterPlaceOptions(zones, "marasti").map((o) => o.value)).toEqual(["marasti"]);
  });

  it("litera M sare la prima zona cu M", () => {
    expect(zones[firstIndexForLetter(zones, "M")].value).toBe("militari");
    expect(firstIndexForLetter(zones, "Z")).toBe(-1);
  });

  it("un cartier sta la sectorul in care apare cel mai des", () => {
    const rows: GeographyRow[] = [
      { city: "București", county: "București", zone: "Sector 3", neighborhood: "Titan" },
      { city: "București", county: "București", zone: "Sector 3", neighborhood: "Titan" },
      { city: "București", county: "București", zone: "Sector 2", neighborhood: "Titan" },
      { city: "București", county: "București", zone: "Sector 3", neighborhood: null },
    ];
    const facets = buildListingFacets(rows);
    const options = facets.zones["bucuresti|bucuresti"];
    expect(options.find((o) => o.value === "titan")?.sector).toBe("sector 3");
    expect(options.find((o) => o.value === "sector 3")?.kind).toBe("sector");
  });
});
