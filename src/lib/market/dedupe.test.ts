import { describe, expect, it } from "vitest";
import {
  DEDUPE_THRESHOLDS,
  buildIdentityHash,
  matchListingToEntities,
  scoreEntityMatch,
  type MarketEntityCandidate,
} from "./dedupe";
import { normalizeRecord, type NormalizedListing } from "./normalize";
import { HABITOO_MAPPING } from "./sources";

function makeListing(overrides: Record<string, unknown> = {}, source = "storia"): NormalizedListing {
  const result = normalizeRecord(
    source,
    {
      id: "S-1",
      tip: "apartament",
      tranzactie: "vanzare",
      oras: "Bucuresti",
      adresa: "Strada Aviatorilor 5",
      camere: 3,
      suprafata_utila: 78,
      etaj: 4,
      an_constructie: 2015,
      pret: 185000,
      ...overrides,
    },
    HABITOO_MAPPING,
  );
  if (!result.ok) throw new Error("normalizare eșuată");
  return result.listing;
}

function makeEntity(overrides: Partial<MarketEntityCandidate> = {}): MarketEntityCandidate {
  return {
    id: "entity-1",
    normalizedAddress: "strada aviatorilor 5",
    normalizedCity: "bucuresti",
    normalizedDistrict: null,
    normalizedNeighborhood: null,
    usableArea: 78,
    rooms: 3,
    floor: 4,
    totalFloors: 8,
    constructionYear: 2015,
    propertyType: "apartament",
    transactionType: "sale",
    latitude: null,
    longitude: null,
    identityHash: null,
    sources: [],
    ...overrides,
  };
}

describe("amprenta de identitate", () => {
  it("se construiește doar cu adresă și suprafață reale", () => {
    expect(buildIdentityHash(makeListing())).toBe("bucuresti|strada aviatorilor 5|78|3");
    expect(buildIdentityHash(makeListing({ adresa: "" }))).toBeNull();
    expect(buildIdentityHash(makeListing({ suprafata_utila: "" }))).toBeNull();
  });
});

describe("scorul de potrivire", () => {
  it("identificatorul de sursă identic dă potrivire sigură", () => {
    const listing = makeListing();
    const entity = makeEntity({
      sources: [{ source: "storia", sourceListingId: "S-1", url: null }],
      normalizedAddress: null,
      usableArea: null,
    });
    const { score, reasons } = scoreEntityMatch(listing, entity);
    expect(score).toBe(100);
    expect(reasons[0]).toContain("Identificator de sursă identic");
  });

  it("URL identic dă potrivire sigură chiar și pe surse diferite", () => {
    const listing = makeListing({ url: "https://storia.ro/anunt/1" });
    const entity = makeEntity({
      sources: [{ source: "olx", sourceListingId: "9", url: "https://storia.ro/anunt/1" }],
    });
    expect(scoreEntityMatch(listing, entity).score).toBe(100);
  });

  it("adresă + suprafață + camere trece pragul de unire automată", () => {
    const result = scoreEntityMatch(makeListing(), makeEntity({ floor: null }));
    expect(result.score).toBeGreaterThanOrEqual(DEDUPE_THRESHOLDS.match);
  });

  it("adresă + suprafață + etaj trece pragul, fără camere", () => {
    const result = scoreEntityMatch(makeListing({ camere: "" }), makeEntity());
    expect(result.score).toBeGreaterThanOrEqual(DEDUPE_THRESHOLDS.match);
  });

  it("coordonatele apropiate cu suprafață și camere identice sunt suficiente", () => {
    const listing = makeListing({ adresa: "Fără număr", lat: 44.45, lng: 26.09 });
    const entity = makeEntity({
      normalizedAddress: "alta strada",
      latitude: 44.4501,
      longitude: 26.0901,
    });
    const result = scoreEntityMatch(listing, entity);
    expect(result.score).toBeGreaterThanOrEqual(DEDUPE_THRESHOLDS.match);
  });

  it("nu unește pe baza prețului și suprafeței apropiate", () => {
    const listing = makeListing({ adresa: "Strada Unirii 12" });
    const entity = makeEntity({ normalizedAddress: "strada mihai viteazu 3", rooms: null, floor: null });
    const result = scoreEntityMatch(listing, entity);
    expect(result.score).toBe(0);
  });

  it("tipul sau tranzacția diferite blochează potrivirea", () => {
    expect(scoreEntityMatch(makeListing(), makeEntity({ propertyType: "casa" })).score).toBe(0);
    expect(scoreEntityMatch(makeListing(), makeEntity({ transactionType: "rent" })).score).toBe(0);
  });

  it("suprafața mult diferită nu se potrivește", () => {
    const result = scoreEntityMatch(makeListing({ suprafata_utila: 120 }), makeEntity({ rooms: null }));
    expect(result.score).toBeLessThan(DEDUPE_THRESHOLDS.match);
  });
});

describe("alegerea entității canonice", () => {
  it("creează o entitate nouă când nu există candidați", () => {
    const decision = matchListingToEntities(makeListing(), []);
    expect(decision.decision).toBe("new");
    expect(decision.entityId).toBeNull();
  });

  it("unește cu entitatea clar câștigătoare", () => {
    const decision = matchListingToEntities(makeListing(), [makeEntity()]);
    expect(decision.decision).toBe("match");
    expect(decision.entityId).toBe("entity-1");
    expect(decision.reasons.length).toBeGreaterThan(0);
  });

  it("cere verificare manuală când două entități se potrivesc la fel", () => {
    const decision = matchListingToEntities(makeListing(), [
      makeEntity({ id: "e1" }),
      makeEntity({ id: "e2" }),
    ]);
    expect(decision.decision).toBe("ambiguous");
    expect(decision.entityId).toBeNull();
    expect(decision.candidates.length).toBe(2);
  });

  it("cere verificare manuală pentru semnale parțiale", () => {
    const decision = matchListingToEntities(makeListing({ camere: "", etaj: "" }), [makeEntity()]);
    expect(decision.decision).toBe("ambiguous");
    expect(decision.score).toBeGreaterThanOrEqual(DEDUPE_THRESHOLDS.review);
    expect(decision.score).toBeLessThan(DEDUPE_THRESHOLDS.match);
  });

  it("scorul prea mic este tratat ca proprietate distinctă", () => {
    const decision = matchListingToEntities(makeListing(), [
      makeEntity({ normalizedAddress: "cu totul alta adresa", rooms: null, floor: null }),
    ]);
    expect(decision.decision).toBe("new");
  });
});
