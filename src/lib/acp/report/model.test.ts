import { describe, expect, it } from "vitest";
import {
  ACP_REPORT_FORMAT_VERSION,
  assertReportOrganization,
  buildAcpReportModel,
  reportDate,
  reportEligibility,
  reportMoney,
  type AcpReportComparableInput,
  type AcpReportVersionInput,
} from "./model";

function comparable(over: Partial<AcpReportComparableInput> = {}): AcpReportComparableInput {
  return {
    key: "market:1",
    title: "Apartament 3 camere",
    sourceType: "portal",
    sourceName: "Imobiliare.ro",
    locationLabel: "Sector 1, București",
    price: 120_000,
    adjustedPrice: 118_000,
    adjustedPricePerSqm: 1_600,
    similarityScore: 88,
    tier: "direct",
    adjustmentAmount: -2_000,
    adjustmentPercent: -1.7,
    adjustments: [{ label: "Etaj", basis: "etaj 1 vs etaj 4", amount: -2_000 }],
    isOutlier: false,
    isSelected: true,
    subject: { rooms: 3, usableArea: 74, currency: "EUR", price: 120_000 },
    ...over,
  };
}

function version(over: Partial<AcpReportVersionInput> = {}): AcpReportVersionInput {
  return {
    analysisId: "a1",
    rootAnalysisId: "a1",
    title: "ACP Apartament Titan",
    status: "completed",
    errorMessage: null,
    version: 1,
    createdAt: "2026-09-01T10:00:00.000Z",
    snapshotAt: "2026-09-01T10:05:00.000Z",
    authorName: "Ana Pop",
    currency: "EUR",
    target: {
      title: "Apartament 3 camere Titan",
      reference: "HB-1024",
      locationLabel: "Titan, București",
      capturedAt: "2026-09-01T10:00:00.000Z",
      pricePerSqm: 1_620,
      subject: { rooms: 3, usableArea: 78, currency: "EUR", price: 126_000 },
    },
    estimate: {
      estimatedMin: 112_000,
      estimatedValue: 120_000,
      estimatedMax: 128_000,
      recommendedListingPrice: 125_000,
    },
    statistics: {
      medianPricePerSqm: 1_600,
      averagePricePerSqm: 1_610,
      median: 119_000,
      average: 120_500,
      minimum: 110_000,
      maximum: 132_000,
      p25: 115_000,
      p75: 126_000,
    },
    confidence: { score: 78, quantity: 80, quality: 75, dispersion: 79 },
    explanation: ["3 comparabile folosite"],
    comparables: [comparable(), comparable({ key: "market:2", similarityScore: 71, tier: "secondary" }), comparable({ key: "market:3", similarityScore: 64 })],
    sources: [
      { sourceType: "own_properties", sourceName: "Proprietăți proprii", itemsFound: 4, itemsUsed: 2, itemsExcluded: 2 },
      { sourceType: "portal", sourceName: "Date piață", itemsFound: 6, itemsUsed: 1, itemsExcluded: 5 },
    ],
    ai: null,
    ...over,
  };
}

const build = (v: AcpReportVersionInput, reportNumber = 1) =>
  buildAcpReportModel({
    version: v,
    reportNumber,
    generatedAt: "2026-09-14T12:00:00.000Z",
    agency: { name: "Agenția Test", cui: "50477503" },
  });

describe("raport ACP — model", () => {
  it("A. generează raportul pentru versiunea curentă", () => {
    const model = build(version());
    expect(model.title).toBe("Analiză Comparativă de Piață");
    expect(model.analysisVersion).toBe(1);
    expect(model.formatVersion).toBe(ACP_REPORT_FORMAT_VERSION);
    expect(model.summary[1]!.value).toBe("120.000 €");
    expect(model.counts).toEqual({ found: 10, used: 3, excluded: 7 });
  });

  it("B. generează raportul pentru o versiune istorică, cu versiunea ei", () => {
    const model = build(version({ analysisId: "a2", version: 2, rootAnalysisId: "a1", snapshotAt: "2026-08-01T09:00:00.000Z" }));
    expect(model.analysisVersion).toBe(2);
    expect(model.rootAnalysisId).toBe("a1");
    expect(model.snapshotAt).toBe("2026-08-01T09:00:00.000Z");
  });

  it("C. folosește exclusiv datele primite din snapshot (nu recalculează)", () => {
    const snapshotVersion = version({
      estimate: {
        estimatedMin: 1,
        estimatedValue: 2,
        estimatedMax: 3,
        recommendedListingPrice: 4,
      },
    });
    const model = build(snapshotVersion);
    expect(model.summary.map((s) => s.value).slice(0, 4)).toEqual(["1 €", "2 €", "3 €", "4 €"]);
  });

  it("D. două rapoarte pentru aceeași versiune diferă doar prin numărul raportului", () => {
    const v = version();
    const first = build(v, 1);
    const second = build(v, 2);
    expect(first.reportNumber).toBe(1);
    expect(second.reportNumber).toBe(2);
    expect({ ...first, reportNumber: 0 }).toEqual({ ...second, reportNumber: 0 });
  });

  it("E. izolarea pe agenție este obligatorie", () => {
    expect(() => assertReportOrganization("org-1", "org-1")).not.toThrow();
    expect(() => assertReportOrganization("org-2", "org-1")).toThrow(/agenția ta/);
    expect(() => assertReportOrganization(null, "org-1")).toThrow();
  });

  it("F. versiune fără rezultat valid nu este eligibilă pentru raport final", () => {
    expect(reportEligibility(version({ status: "running" })).ok).toBe(false);
    expect(
      reportEligibility(
        version({ estimate: { estimatedMin: null, estimatedValue: null, estimatedMax: null, recommendedListingPrice: null } }),
      ).ok,
    ).toBe(false);
    expect(reportEligibility(version({ comparables: [] })).ok).toBe(false);
    expect(reportEligibility(version()).ok).toBe(true);
  });

  it("G. fără AI raportul este valid și nu are secțiunea AI", () => {
    const model = build(version({ ai: null }));
    expect(model.ai).toBeNull();
    expect(model.summary.length).toBeGreaterThan(0);
  });

  it("H. AI-ul este separat și nu modifică nicio cifră", () => {
    const withoutAi = build(version());
    const withAi = build(
      version({ ai: { summary: "Piața este stabilă.", model: "gemini", generatedAt: "2026-09-10T08:00:00.000Z" } }),
    );
    expect(withAi.ai?.summary).toBe("Piața este stabilă.");
    expect(withAi.summary).toEqual(withoutAi.summary);
    expect(withAi.statistics).toEqual(withoutAi.statistics);
    expect(withAi.comparables).toEqual(withoutAi.comparables);
  });

  it("I. comparabilele, sursele și outlierii reflectă snapshot-ul", () => {
    const model = build(
      version({
        comparables: [
          comparable({ key: "x", similarityScore: 50, isSelected: false, isOutlier: true, outlierReason: "preț atipic" }),
          comparable({ key: "y", similarityScore: 95 }),
        ],
      }),
    );
    expect(model.comparables.map((c) => c.key)).toEqual(["y", "x"]);
    expect(model.comparables[1]!.outlier).toBe(true);
    expect(model.comparables[1]!.flags).toContain("atipic");
    expect(model.sources.map((s) => s.name)).toEqual(["Proprietăți proprii", "Date piață"]);
    expect(model.warnings.some((w) => w.includes("atipice"))).toBe(true);
  });

  it("J. valorile null/zero nu produc NaN sau Infinity", () => {
    const model = build(
      version({
        estimate: { estimatedMin: 0, estimatedValue: 0, estimatedMax: null, recommendedListingPrice: null },
        statistics: {
          medianPricePerSqm: null,
          averagePricePerSqm: 0,
          median: null,
          average: null,
          minimum: null,
          maximum: null,
          p25: null,
          p75: null,
        },
        confidence: { score: null },
        comparables: [comparable({ price: null, adjustedPrice: null, adjustedPricePerSqm: null, similarityScore: null, adjustmentAmount: null, adjustmentPercent: null, adjustments: [] })],
      }),
    );
    const serialized = JSON.stringify(model);
    expect(serialized).not.toMatch(/NaN|Infinity/);
    expect(model.confidenceLabel).toBe("—");
    expect(reportMoney(null, "EUR")).toBe("—");
    expect(reportMoney(0, "EUR")).toBe("0 €");
  });

  it("K. versiune eșuată produce avertismente clare, nu un rezultat final", () => {
    const failed = version({
      status: "draft",
      errorMessage: "Nu există date suficiente.",
      estimate: { estimatedMin: null, estimatedValue: null, estimatedMax: null, recommendedListingPrice: null },
      comparables: [],
    });
    expect(reportEligibility(failed)).toEqual({ ok: false, reason: "Nu există date suficiente." });
    const model = build(failed);
    expect(model.warnings.length).toBeGreaterThan(0);
    expect(model.summary[1]!.value).toBe("—");
  });

  it("L. modelul este determinist — același snapshot dă același raport", () => {
    const v = version();
    expect(build(v)).toEqual(build(v));
  });

  it("M. metadatele raportului sunt corecte", () => {
    const model = build(version({ version: 3, snapshotAt: "2026-07-04T06:30:00.000Z" }));
    expect(model.analysisVersion).toBe(3);
    expect(reportDate(model.generatedAt)).toBe("14.09.2026 12:00");
    expect(reportDate(model.snapshotAt)).toBe("04.07.2026 06:30");
    expect(model.authorName).toBe("Ana Pop");
    expect(model.statusLabel).toBe("Finalizată");
    expect(model.confidenceLabel).toBe("78/100");
  });

  it("N. metodologia și precizările nu conțin afirmații despre AI care schimbă cifrele", () => {
    const model = build(version());
    expect(model.methodology.join(" ")).toContain("Nu intervine nicio estimare generată automat");
    expect(model.property.rows.find((r) => r.label === "Suprafață utilă")?.value).toBe("78 mp");
  });
});
