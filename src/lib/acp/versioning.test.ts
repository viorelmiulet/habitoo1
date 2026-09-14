import { describe, expect, it } from "vitest";
import {
  compareAcpVersionSnapshots,
  nextVersionNumber,
  numericDiff,
  type AcpVersionComparable,
  type AcpVersionSnapshot,
} from "./versioning";

function comparable(
  key: string,
  overrides: Partial<AcpVersionComparable> = {},
): AcpVersionComparable {
  return {
    key,
    title: `Comparabil ${key}`,
    sourceName: "Date interne Habitoo",
    price: 100000,
    adjustedPrice: 102000,
    adjustedPricePerSqm: 1700,
    similarityScore: 80,
    tier: "direct",
    adjustmentAmount: 2000,
    isOutlier: false,
    isSelected: true,
    ...overrides,
  };
}

function snapshot(
  version: number,
  overrides: Partial<AcpVersionSnapshot> = {},
): AcpVersionSnapshot {
  return {
    id: `analysis-${version}`,
    version,
    status: "completed",
    errorMessage: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    snapshotAt: "2026-09-01T10:00:00.000Z",
    createdByName: "Agent Test",
    estimatedValue: 100000,
    estimatedMin: 95000,
    estimatedMax: 105000,
    recommendedListingPrice: 103000,
    medianPricePerSqm: 1700,
    averagePricePerSqm: 1710,
    confidenceScore: 70,
    comparablesCount: 3,
    comparablesUsed: 2,
    currency: "EUR",
    sources: [
      {
        sourceType: "own_properties",
        sourceName: "Proprietăți proprii",
        itemsFound: 10,
        itemsUsed: 4,
        itemsExcluded: 6,
      },
    ],
    comparables: [comparable("a"), comparable("b")],
    ai: null,
    ...overrides,
  };
}

describe("nextVersionNumber (A, D)", () => {
  it("prima analiză este versiunea 1 și rămâne propriul root", () => {
    expect(nextVersionNumber([])).toBe(2);
    expect(nextVersionNumber([1])).toBe(2);
  });

  it("incrementează corect peste maximul existent, cu găuri", () => {
    expect(nextVersionNumber([1, 2, 5])).toBe(6);
    expect(nextVersionNumber([3, 1])).toBe(4);
  });
});

describe("numericDiff (G)", () => {
  it("calculează diferența absolută și procentuală", () => {
    expect(numericDiff(100, 110)).toEqual({ a: 100, b: 110, absolute: 10, percent: 10 });
    expect(numericDiff(200, 150)).toEqual({ a: 200, b: 150, absolute: -50, percent: -25 });
  });

  it("nu produce NaN/Infinity pentru 0 sau null", () => {
    expect(numericDiff(0, 500)).toEqual({ a: 0, b: 500, absolute: 500, percent: null });
    expect(numericDiff(null, 500)).toEqual({ a: null, b: 500, absolute: null, percent: null });
    expect(numericDiff(500, null)).toEqual({ a: 500, b: null, absolute: null, percent: null });
    expect(numericDiff(undefined, undefined).percent).toBeNull();
  });
});

describe("compareAcpVersionSnapshots (F, H, I, M)", () => {
  it("compară indicatorii motorului cu diferențe corecte", () => {
    const a = snapshot(1);
    const b = snapshot(2, {
      estimatedValue: 110000,
      recommendedListingPrice: 113000,
      medianPricePerSqm: 1785,
      confidenceScore: 80,
      comparablesUsed: 3,
    });
    const result = compareAcpVersionSnapshots(a, b);
    expect(result.versionA.version).toBe(1);
    expect(result.versionB.version).toBe(2);
    expect(result.estimatedValue).toMatchObject({ absolute: 10000, percent: 10 });
    expect(result.recommendedListingPrice.absolute).toBe(10000);
    expect(result.medianPricePerSqm.percent).toBe(5);
    expect(result.confidenceScore.absolute).toBe(10);
    expect(result.comparablesUsed.absolute).toBe(1);
  });

  it("detectează comparabile comune, adăugate și eliminate", () => {
    const a = snapshot(1, { comparables: [comparable("a"), comparable("b")] });
    const b = snapshot(2, {
      comparables: [
        comparable("b", { price: 120000, similarityScore: 84, tier: "secondary" }),
        comparable("c"),
      ],
    });
    const result = compareAcpVersionSnapshots(a, b);
    expect(result.comparables.common.map((c) => c.key)).toEqual(["b"]);
    expect(result.comparables.added.map((c) => c.key)).toEqual(["c"]);
    expect(result.comparables.removed.map((c) => c.key)).toEqual(["a"]);
    const changed = result.comparables.common[0]!;
    expect(changed.price.absolute).toBe(20000);
    expect(changed.similarityScore.absolute).toBe(4);
    expect(changed.tierFrom).toBe("direct");
    expect(changed.tierTo).toBe("secondary");
    expect(changed.changes).toContain("preț");
    expect(changed.changes).toContain("categorie");
  });

  it("compară sursele și numărătorile, inclusiv sursele apărute doar într-o versiune", () => {
    const a = snapshot(1);
    const b = snapshot(2, {
      sources: [
        {
          sourceType: "own_properties",
          sourceName: "Proprietăți proprii",
          itemsFound: 14,
          itemsUsed: 5,
          itemsExcluded: 9,
        },
        {
          sourceType: "portal",
          sourceName: "Imobiliare.ro",
          itemsFound: 8,
          itemsUsed: 2,
          itemsExcluded: 6,
        },
      ],
    });
    const result = compareAcpVersionSnapshots(a, b);
    expect(result.sources).toHaveLength(2);
    const own = result.sources.find((s) => s.sourceType === "own_properties")!;
    expect(own.itemsFound.absolute).toBe(4);
    expect(own.itemsUsed.absolute).toBe(1);
    expect(own.presentInA).toBe(true);
    const portal = result.sources.find((s) => s.sourceType === "portal")!;
    expect(portal.presentInA).toBe(false);
    expect(portal.presentInB).toBe(true);
    expect(portal.itemsFound).toMatchObject({ a: null, b: 8, absolute: null, percent: null });
  });

  it("interpretarea AI este doar metadată: nu schimbă nicio cifră comparată", () => {
    const a = snapshot(1);
    const b = snapshot(2, {
      ai: { model: "test-model", generatedAt: "2026-09-02T09:00:00.000Z", summary: "Text AI" },
    });
    const withAi = compareAcpVersionSnapshots(a, b);
    const withoutAi = compareAcpVersionSnapshots(a, snapshot(2));
    expect(withAi.estimatedValue).toEqual(withoutAi.estimatedValue);
    expect(withAi.medianPricePerSqm).toEqual(withoutAi.medianPricePerSqm);
    expect(withAi.versionB.ai?.model).toBe("test-model");
    expect(withoutAi.versionB.ai).toBeNull();
  });

  it("este determinist: aceleași intrări produc același rezultat", () => {
    const a = snapshot(1);
    const b = snapshot(2, { estimatedValue: 111111 });
    expect(compareAcpVersionSnapshots(a, b)).toEqual(compareAcpVersionSnapshots(a, b));
  });

  it("snapshot-ul unei versiuni istorice rămâne exact cel salvat (E, O)", () => {
    const historic = snapshot(1);
    const frozen = JSON.parse(JSON.stringify(historic)) as AcpVersionSnapshot;
    // O versiune nouă cu date de piață schimbate nu atinge snapshot-ul vechi.
    compareAcpVersionSnapshots(historic, snapshot(2, { estimatedValue: 200000 }));
    expect(historic).toEqual(frozen);
  });
});
