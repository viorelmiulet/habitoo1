import { describe, expect, it } from "vitest";
import {
  ACP_SCORE_WEIGHTS,
  ACP_THRESHOLDS,
  classifyComparable,
} from "@/lib/acp/config";
import {
  calculateComparableSimilarity,
  haversineKm,
  scoreArea,
  scoreDistance,
  scoreFloor,
  scoreLocation,
  scoreRooms,
  type AcpSubject,
} from "@/lib/acp/scoring";

const target: AcpSubject = {
  propertyType: "apartment",
  transactionType: "sale",
  city: "București",
  county: "București",
  district: "Militari Residence",
  neighborhood: "Militari Residence",
  rooms: 2,
  usableArea: 58,
  floor: 3,
  totalFloors: 8,
  constructionYear: 2018,
  condition: "buna",
  parking: true,
  balcony: true,
  furnished: false,
  price: 78_000,
  latitude: 44.4425,
  longitude: 25.9911,
};

const candidateA: AcpSubject = {
  ...target,
  usableArea: 57,
  price: 76_500,
};

const candidateB: AcpSubject = {
  propertyType: "apartment",
  transactionType: "sale",
  city: "București",
  county: "București",
  district: "Titan",
  neighborhood: "Titan",
  rooms: 3,
  usableArea: 90,
  floor: 7,
  totalFloors: 10,
  constructionYear: 1978,
  condition: "necesita renovare",
  parking: false,
  balcony: true,
  furnished: false,
  price: 120_000,
  latitude: 44.4183,
  longitude: 26.1416,
};

describe("configurația motorului ACP", () => {
  it("are ponderi care însumează exact 100", () => {
    const total = Object.values(ACP_SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });

  it("clasifică pe pragurile 85 / 70", () => {
    expect(classifyComparable(92)).toBe("direct");
    expect(classifyComparable(ACP_THRESHOLDS.direct)).toBe("direct");
    expect(classifyComparable(75)).toBe("secondary");
    expect(classifyComparable(69.99)).toBe("excluded");
  });
});

describe("calculateComparableSimilarity", () => {
  it("dă un scor semnificativ mai mare candidatului din aceeași zonă", () => {
    const a = calculateComparableSimilarity(target, candidateA);
    const b = calculateComparableSimilarity(target, candidateB);
    expect(a.similarityScore).toBeGreaterThan(b.similarityScore + 30);
    expect(a.tier).toBe("direct");
    expect(b.tier).toBe("excluded");
  });

  it("returnează fiecare componentă separat, în interval 0–100", () => {
    const result = calculateComparableSimilarity(target, candidateA);
    for (const key of Object.keys(ACP_SCORE_WEIGHTS)) {
      const value = result.components[key as keyof typeof ACP_SCORE_WEIGHTS];
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
    expect(result.similarityScore).toBeLessThanOrEqual(100);
  });

  it("marchează componentele fără date și le dă scor neutru", () => {
    const bare: AcpSubject = { city: "București", rooms: 2, usableArea: 58 };
    const result = calculateComparableSimilarity(bare, { city: "București", rooms: 2, usableArea: 58 });
    expect(result.missing).toContain("distance");
    expect(result.missing).toContain("year");
    expect(result.components.distance).toBe(60);
  });

  it("este determinist: aceleași intrări produc același rezultat", () => {
    const first = calculateComparableSimilarity(target, candidateB);
    const second = calculateComparableSimilarity(target, candidateB);
    expect(first).toEqual(second);
  });
});

describe("scoring pe suprafață", () => {
  it("dă 100 la suprafață identică și scade cu diferența relativă", () => {
    expect(scoreArea({ usableArea: 58 }, { usableArea: 58 })).toBe(100);
    expect(scoreArea({ usableArea: 58 }, { usableArea: 57 })!).toBeGreaterThan(90);
    expect(scoreArea({ usableArea: 58 }, { usableArea: 90 })).toBe(0);
  });

  it("returnează null când lipsesc datele", () => {
    expect(scoreArea({ usableArea: null }, { usableArea: 58 })).toBeNull();
  });
});

describe("scoring pe camere", () => {
  it("penalizează diferența de camere în trepte", () => {
    expect(scoreRooms({ rooms: 2 }, { rooms: 2 })).toBe(100);
    expect(scoreRooms({ rooms: 2 }, { rooms: 3 })).toBe(55);
    expect(scoreRooms({ rooms: 2 }, { rooms: 4 })).toBe(20);
    expect(scoreRooms({ rooms: 2 }, { rooms: 6 })).toBe(0);
  });
});

describe("scoring pe locație", () => {
  it("respectă ierarhia cartier → oraș → județ", () => {
    expect(scoreLocation({ neighborhood: "Militari Residence" }, { neighborhood: "militari residence" })).toBe(100);
    expect(scoreLocation({ district: "Militari" }, { district: "Militari" })).toBe(100);
    expect(
      scoreLocation({ city: "București", neighborhood: "Militari" }, { city: "București", neighborhood: "Titan" }),
    ).toBe(60);
    expect(
      scoreLocation({ county: "Ilfov", city: "Chiajna" }, { county: "Ilfov", city: "Buftea" }),
    ).toBe(35);
  });

  it("ignoră diacriticele la comparare", () => {
    expect(scoreLocation({ neighborhood: "Drumul Taberei" }, { neighborhood: "drumul taberei" })).toBe(100);
  });
});

describe("scoring pe distanță", () => {
  it("scade odată cu distanța și devine 0 peste toleranță", () => {
    const same = scoreDistance(
      { latitude: 44.4425, longitude: 25.9911 },
      { latitude: 44.4425, longitude: 25.9911 },
    );
    expect(same).toBe(100);
    const far = scoreDistance(
      { latitude: 44.4425, longitude: 25.9911 },
      { latitude: 44.4183, longitude: 26.1416 },
    );
    expect(far).toBe(0);
  });

  it("calculează distanța Haversine în kilometri", () => {
    const km = haversineKm(
      { latitude: 44.4425, longitude: 25.9911 },
      { latitude: 44.4425, longitude: 26.0911 },
    );
    expect(km).toBeGreaterThan(7);
    expect(km).toBeLessThan(9);
  });
});

describe("scoring pe etaj", () => {
  it("penalizează diferența de nivel, parterul și ultimul etaj", () => {
    expect(scoreFloor({ floor: 3 }, { floor: 3 })).toBe(100);
    expect(scoreFloor({ floor: 3 }, { floor: 4 })).toBe(85);
    expect(scoreFloor({ floor: 1 }, { floor: 0 })).toBe(75);
    expect(scoreFloor({ floor: 3, totalFloors: 8 }, { floor: 8, totalFloors: 8 })).toBe(15);
  });
});
