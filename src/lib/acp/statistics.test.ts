import { describe, expect, it } from "vitest";
import {
  average,
  calculateMarketStatistics,
  detectPriceOutliers,
  median,
  percentile,
  pricePerSqm,
} from "@/lib/acp/statistics";

describe("mediană", () => {
  it("calculează corect pentru serii impare și pare", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("P25 / P75", () => {
  it("interpolează liniar", () => {
    const values = [1, 2, 3, 4, 5];
    expect(percentile(values, 0.25)).toBe(2);
    expect(percentile(values, 0.75)).toBe(4);
    expect(percentile([10, 20, 30, 40], 0.25)).toBe(17.5);
    expect(percentile([10, 20, 30, 40], 0.75)).toBe(32.5);
  });
});

describe("preț pe metru pătrat", () => {
  it("împarte prețul la suprafață și rotunjește la 2 zecimale", () => {
    expect(pricePerSqm(78_000, 58)).toBe(1344.83);
    expect(pricePerSqm(100_000, 50)).toBe(2000);
  });

  it("refuză valori invalide", () => {
    expect(pricePerSqm(null, 58)).toBeNull();
    expect(pricePerSqm(78_000, 0)).toBeNull();
    expect(pricePerSqm(0, 58)).toBeNull();
  });
});

describe("detectPriceOutliers", () => {
  it("marchează valorile extreme fără să le șteargă", () => {
    const values = [1300, 1350, 1380, 1400, 1420, 9000];
    const result = detectPriceOutliers(values);
    expect(result.flags).toHaveLength(values.length);
    expect(result.outlierCount).toBe(1);
    expect(result.flags[5]!.isOutlier).toBe(true);
    expect(result.flags[5]!.reason).toBe("high");
    expect(result.cleanValues).toEqual([1300, 1350, 1380, 1400, 1420]);
  });

  it("marchează și valorile prea mici", () => {
    const result = detectPriceOutliers([100, 1300, 1350, 1380, 1400, 1420]);
    expect(result.flags[0]!.isOutlier).toBe(true);
    expect(result.flags[0]!.reason).toBe("low");
  });

  it("nu marchează nimic pe serii prea mici pentru IQR", () => {
    const result = detectPriceOutliers([1000, 5000, 9000]);
    expect(result.outlierCount).toBe(0);
  });

  it("ignoră valorile lipsă", () => {
    const result = detectPriceOutliers([1300, null, 1350, undefined, 1380, 1400]);
    expect(result.flags[1]!.value).toBeNull();
    expect(result.flags[1]!.isOutlier).toBe(false);
  });
});

describe("calculateMarketStatistics", () => {
  const comparables = [
    { price: 70_000, usableArea: 55 },
    { price: 76_500, usableArea: 57 },
    { price: 78_000, usableArea: 58 },
    { price: 82_000, usableArea: 60 },
  ];

  it("calculează min, max, medie, mediană, P25 și P75", () => {
    const stats = calculateMarketStatistics(comparables);
    expect(stats.count).toBe(4);
    expect(stats.usedCount).toBe(4);
    expect(stats.minimum).toBe(70_000);
    expect(stats.maximum).toBe(82_000);
    expect(stats.average).toBe(76_625);
    expect(stats.median).toBe(77_250);
    expect(stats.p25).toBe(74_875);
    expect(stats.p75).toBe(79_000);
  });

  it("calculează prețul pe metru pătrat mediu și median", () => {
    const stats = calculateMarketStatistics(comparables);
    expect(stats.averagePricePerSqm).toBeGreaterThan(1250);
    expect(stats.averagePricePerSqm).toBeLessThan(1400);
    expect(stats.medianPricePerSqm).toBeGreaterThan(1250);
  });

  it("exclude outlierii marcați din statistica principală", () => {
    const stats = calculateMarketStatistics([
      ...comparables,
      { price: 400_000, usableArea: 58, isOutlier: true },
    ]);
    expect(stats.count).toBe(5);
    expect(stats.usedCount).toBe(4);
    expect(stats.outlierCount).toBe(1);
    expect(stats.maximum).toBe(82_000);
  });

  it("returnează null pe listă goală", () => {
    const stats = calculateMarketStatistics([]);
    expect(stats.average).toBeNull();
    expect(stats.median).toBeNull();
  });
});

describe("medie", () => {
  it("ignoră valorile lipsă", () => {
    expect(average([2, null, 4, undefined])).toBe(3);
    expect(average([])).toBeNull();
  });
});
