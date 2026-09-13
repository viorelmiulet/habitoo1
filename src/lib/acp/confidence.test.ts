import { describe, expect, it } from "vitest";
import { ACP_CONFIDENCE_CONFIG, calculateConfidence } from "./confidence";

describe("calculateConfidence", () => {
  it("plafonează încrederea sub numărul minim de comparabile", () => {
    const result = calculateConfidence({
      usedCount: 2,
      similarityScores: [98, 97],
      pricePerSqmValues: [2000, 2010],
    });
    expect(result.score).toBeLessThanOrEqual(ACP_CONFIDENCE_CONFIG.cappedScore);
    expect(result.notes.join(" ")).toContain("plafonată");
  });

  it("dă scor mare pentru multe comparabile similare și grupate", () => {
    const result = calculateConfidence({
      usedCount: 8,
      similarityScores: [96, 95, 94, 93, 92, 91, 90, 89],
      pricePerSqmValues: [2000, 2010, 2020, 2015, 2005, 1995, 2008, 2012],
    });
    expect(result.quantity).toBe(40);
    expect(result.score).toBeGreaterThan(80);
    expect(result.capped).toBe(false);
  });

  it("penalizează dispersia mare a prețului pe mp", () => {
    const strans = calculateConfidence({
      usedCount: 6,
      similarityScores: [90, 90, 90, 90, 90, 90],
      pricePerSqmValues: [2000, 2005, 2010, 2015, 2020, 2025],
    });
    const larg = calculateConfidence({
      usedCount: 6,
      similarityScores: [90, 90, 90, 90, 90, 90],
      pricePerSqmValues: [1200, 1600, 2000, 2400, 2800, 3200],
    });
    expect(larg.dispersion).toBeLessThan(strans.dispersion);
    expect(larg.score).toBeLessThan(strans.score);
  });

  it("este determinist", () => {
    const input = {
      usedCount: 5,
      similarityScores: [88, 84, 80, 76, 72],
      pricePerSqmValues: [1900, 1950, 2000, 2050, 2100],
    };
    expect(calculateConfidence(input)).toEqual(calculateConfidence(input));
  });

  it("nu măsoară dispersia sub 4 valori", () => {
    const result = calculateConfidence({
      usedCount: 3,
      similarityScores: [90, 88, 86],
      pricePerSqmValues: [2000, 2100, 2200],
    });
    expect(result.dispersion).toBe(0);
    expect(result.dispersionRatio).toBeNull();
  });
});
