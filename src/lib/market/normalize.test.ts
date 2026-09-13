import { describe, expect, it } from "vitest";
import { parseCsv, detectDelimiter } from "./csv";
import {
  computePricePerSqm,
  normalizeCondition,
  normalizeCurrency,
  normalizeFloor,
  normalizeMatchText,
  normalizePropertyType,
  normalizeRecord,
  normalizeTransactionType,
  parseBooleanValue,
  parseNumber,
} from "./normalize";
import { HABITOO_MAPPING } from "./sources";

describe("normalizarea valorilor", () => {
  it("citește numere în format românesc și internațional", () => {
    expect(parseNumber("120.000")).toBe(120000);
    expect(parseNumber("120.000,50")).toBe(120000.5);
    expect(parseNumber("1,200,000")).toBe(1200000);
    expect(parseNumber("85,5 mp")).toBe(85.5);
    expect(parseNumber("€ 140000")).toBe(140000);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("necomunicat")).toBeNull();
  });

  it("interpretează valorile logice în română și engleză", () => {
    expect(parseBooleanValue("da")).toBe(true);
    expect(parseBooleanValue("NU")).toBe(false);
    expect(parseBooleanValue("true")).toBe(true);
    expect(parseBooleanValue("poate")).toBeNull();
  });

  it("normalizează tipul, tranzacția, moneda și starea", () => {
    expect(normalizePropertyType("Apartament 3 camere")).toBe("apartament");
    expect(normalizePropertyType("Vilă")).toBe("casa");
    expect(normalizeTransactionType("De vânzare")).toBe("sale");
    expect(normalizeTransactionType("închiriere")).toBe("rent");
    expect(normalizeTransactionType("altceva")).toBeNull();
    expect(normalizeCurrency("Euro")).toBe("EUR");
    expect(normalizeCurrency("lei")).toBe("RON");
    expect(normalizeCondition("Necesită renovare")).toBe("necesita renovare");
  });

  it("interpretează etajul textual", () => {
    expect(normalizeFloor("Parter")).toBe(0);
    expect(normalizeFloor("demisol")).toBe(-1);
    expect(normalizeFloor("Etaj 4")).toBe(4);
    expect(normalizeFloor("mansardă")).toBeNull();
  });

  it("normalizează textul pentru potrivire, cu abrevieri extinse", () => {
    expect(normalizeMatchText("Str. Aviatorilor nr. 5")).toBe("strada aviatorilor numarul 5");
    expect(normalizeMatchText("  Bd.  Unirii  ")).toBe("bulevardul unirii");
    expect(normalizeMatchText("Șoseaua Pipera")).toBe("soseaua pipera");
  });

  it("calculează prețul pe metru pătrat doar cu date reale", () => {
    expect(computePricePerSqm(100000, 50, null)).toBe(2000);
    expect(computePricePerSqm(100000, null, 80)).toBe(1250);
    expect(computePricePerSqm(100000, 0, 0)).toBeNull();
    expect(computePricePerSqm(null, 50, null)).toBeNull();
  });
});

describe("normalizeRecord", () => {
  const record = {
    id: "A-100",
    url: "https://exemplu.ro/anunt/100",
    titlu: "Apartament 3 camere Aviatorilor",
    tip: "Apartament",
    tranzactie: "vanzare",
    oras: "Bucureşti",
    judet: "Bucureşti",
    cartier: "Aviatorilor",
    adresa: "Str. Aviatorilor nr. 5",
    camere: "3",
    suprafata_utila: "78,5",
    etaj: "Etaj 4",
    nr_etaje: "8",
    an_constructie: "2015",
    pret: "185.000",
    moneda: "EUR",
    stare: "renovat",
    mobilat: "da",
    parcare: "nu",
    balcon: "da",
    dotari: "aer condiționat, lift",
    telefon: "0722000000",
  };

  it("normalizează o ofertă completă și păstrează originalele în raw_data", () => {
    const result = normalizeRecord("imobiliare_ro", record, HABITOO_MAPPING);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const listing = result.listing;
    expect(listing.sourceListingId).toBe("A-100");
    expect(listing.propertyType).toBe("apartament");
    expect(listing.transactionType).toBe("sale");
    expect(listing.city).toBe("Bucureşti");
    expect(listing.normalizedCity).toBe("bucuresti");
    expect(listing.normalizedAddress).toBe("strada aviatorilor numarul 5");
    expect(listing.usableArea).toBe(78.5);
    expect(listing.floor).toBe(4);
    expect(listing.price).toBe(185000);
    expect(listing.currency).toBe("EUR");
    expect(listing.pricePerSqm).toBeCloseTo(2356.69, 1);
    expect(listing.furnished).toBe(true);
    expect(listing.parking).toBe(false);
    expect(listing.features).toEqual({ "aer conditionat": true, lift: true });
    // valoarea originală se păstrează
    expect(listing.rawData.original.pret).toBe("185.000");
    expect(listing.rawData.original.adresa).toBe("Str. Aviatorilor nr. 5");
    // datele de contact nu se salvează
    expect(JSON.stringify(listing.rawData)).not.toContain("0722000000");
  });

  it("nu inventează valorile lipsă", () => {
    const result = normalizeRecord(
      "imobiliare_ro",
      { id: "B-1", oras: "Cluj-Napoca" },
      HABITOO_MAPPING,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.listing.price).toBeNull();
    expect(result.listing.rooms).toBeNull();
    expect(result.listing.pricePerSqm).toBeNull();
    expect(result.listing.condition).toBeNull();
  });

  it("respinge lipsa identificatorului obligatoriu", () => {
    const result = normalizeRecord("imobiliare_ro", { oras: "Brașov" }, HABITOO_MAPPING);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues[0]?.field).toBe("sourceListingId");
  });

  it("respinge date corupte și prețuri imposibile", () => {
    expect(normalizeRecord("imobiliare_ro", "text", HABITOO_MAPPING).ok).toBe(false);
    expect(normalizeRecord("imobiliare_ro", [1, 2], HABITOO_MAPPING).ok).toBe(false);
    const negative = normalizeRecord(
      "imobiliare_ro",
      { id: "C-1", pret: "-1000" },
      HABITOO_MAPPING,
    );
    expect(negative.ok).toBe(false);
  });

  it("ignoră imaginile și URL-urile invalide", () => {
    const result = normalizeRecord(
      "imobiliare_ro",
      { id: "D-1", url: "exemplu.ro/anunt", image_url: "poza.jpg" },
      HABITOO_MAPPING,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.listing.url).toBeNull();
    expect(result.listing.imageUrl).toBeNull();
  });
});

describe("parser CSV", () => {
  it("detectează separatorul și citește câmpurile cu ghilimele", () => {
    const csv = 'id;oras;adresa\n1;Bucuresti;"Str. Unirii, nr. 3"\n2;Cluj;Strada Horea\n';
    expect(detectDelimiter(csv)).toBe(";");
    const parsed = parseCsv(csv);
    expect(parsed.headers).toEqual(["id", "oras", "adresa"]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.adresa).toBe("Str. Unirii, nr. 3");
  });

  it("acceptă ghilimele duble, CRLF și BOM", () => {
    const csv = '\uFEFFid,titlu\r\n1,"Apartament ""de lux"""\r\n';
    const parsed = parseCsv(csv);
    expect(parsed.rows[0]?.titlu).toBe('Apartament "de lux"');
  });
});
