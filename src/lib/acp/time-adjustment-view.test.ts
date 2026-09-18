/**
 * Prezentarea ajustării în timp + garda pe apelurile motorului.
 *
 * Garda de la final este comportamentală: dacă cineva adaugă un apel nou la
 * `runAcpAnalysis` fără `priceIndex` și `engineVersion`, testul cade. Altfel
 * utilizatorul ar vedea „indicele nu este disponibil" deși datele există.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  acpEngineVersionLabel,
  buildAcpComparableTimeAdjustmentView,
  buildAcpTimeAdjustmentView,
} from "./time-adjustment-view";
import { buildAcpTimeAdjustmentSummary, computeAcpTimeAdjustment } from "./time-adjustment";
import type { AcpPriceIndexSnapshot } from "./time-adjustment";

const index: AcpPriceIndexSnapshot = {
  source: "Eurostat",
  dataset: "prc_hpi_q",
  series: "total",
  unit: "I15_Q",
  baseLabel: "2015 = 100",
  region: "RO",
  points: [
    { year: 2023, quarter: 1, value: 100 },
    { year: 2023, quarter: 2, value: 105 },
    { year: 2023, quarter: 3, value: 110 },
  ],
};

function summaryFor(analysisAt: string, observedAt: string | null, idx = index) {
  const adjustments = [
    computeAcpTimeAdjustment({ index: idx, price: 100_000, observedAt, analysisAt }),
  ];
  return {
    adjustments,
    summary: buildAcpTimeAdjustmentSummary({ index: idx, analysisAt, adjustments }),
  };
}

describe("prezentarea ajustării în timp", () => {
  it("nu afișează nimic pentru analizele calculate cu motorul v1", () => {
    const { summary, adjustments } = summaryFor("2023-08-10", "2023-02-10");
    expect(buildAcpTimeAdjustmentView({ engineVersion: 1, summary })).toBeNull();
    expect(
      buildAcpComparableTimeAdjustmentView({ engineVersion: 1, timeAdjustment: adjustments[0] }),
    ).toBeNull();
  });

  it("nu afișează nimic dacă analiza v2 nu are rezumat salvat", () => {
    expect(buildAcpTimeAdjustmentView({ engineVersion: 2, summary: null })).toBeNull();
    expect(buildAcpComparableTimeAdjustmentView({ engineVersion: 2, timeAdjustment: null })).toBeNull();
  });

  it("v2 cu indice disponibil: trimestru, indice, avertisment național, numărători", () => {
    const { summary, adjustments } = summaryFor("2023-08-10", "2023-02-10");
    const view = buildAcpTimeAdjustmentView({ engineVersion: 2, summary })!;
    expect(view.indexAvailable).toBe(true);
    expect(view.analysisQuarter).toBe("2023-Q3");
    expect(view.indexLine).toContain("Eurostat");
    expect(view.indexLine).toContain("prc_hpi_q");
    expect(view.indexLine).toContain("2015 = 100");
    expect(view.nationalCaveat).toContain("NAȚIONAL");
    expect(view.clampedTo).toBeNull();
    expect(view.appliedCount).toBe(1);
    expect(view.skippedCount).toBe(0);
    expect(view.countsLine).toContain("1 comparabile ajustate");

    const row = buildAcpComparableTimeAdjustmentView({
      engineVersion: 2,
      timeAdjustment: adjustments[0],
    })!;
    expect(row.applied).toBe(true);
    expect(row.originalPrice).toBe(100_000);
    expect(row.comparableQuarter).toBe("2023-Q1");
    expect(row.usedQuarter).toBe("2023-Q3");
    expect(row.ratio).toBe(1.1);
    expect(row.adjustedPrice).toBe(110_000);
  });

  it("v2 fără indice în baza de date: bloc afișat, dar fără ajustare", () => {
    const adjustments = [
      computeAcpTimeAdjustment({
        index: null,
        price: 100_000,
        observedAt: "2023-02-10",
        analysisAt: "2023-08-10",
      }),
    ];
    const summary = buildAcpTimeAdjustmentSummary({
      index: null,
      analysisAt: "2023-08-10",
      adjustments,
    });
    const view = buildAcpTimeAdjustmentView({ engineVersion: 2, summary })!;
    expect(view.indexAvailable).toBe(false);
    expect(view.indexLine).toBeNull();
    expect(view.appliedCount).toBe(0);
    expect(view.skippedCount).toBe(1);

    const row = buildAcpComparableTimeAdjustmentView({
      engineVersion: 2,
      timeAdjustment: adjustments[0],
    })!;
    expect(row.applied).toBe(false);
    expect(row.reason).toContain("nu este disponibil");
  });

  it("analiză plafonată: arată trimestrul la care se oprește ajustarea", () => {
    const { summary, adjustments } = summaryFor("2026-05-10", "2023-02-10");
    const view = buildAcpTimeAdjustmentView({ engineVersion: 2, summary })!;
    expect(view.analysisQuarter).toBe("2026-Q2");
    expect(view.clampedTo).toBe("2023-Q3");
    expect(view.clampLine).toContain("2023-Q3");
    expect(adjustments[0]!.clamped).toBe(true);
  });

  it("eticheta versiunii de metodologie distinge v1 de v2", () => {
    expect(acpEngineVersionLabel(1)).toBe("Metodologie v1");
    expect(acpEngineVersionLabel(2)).toContain("ajustare în timp");
    expect(acpEngineVersionLabel(null)).toBe("Metodologie v1");
  });
});

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (/\.test\.tsx?$/.test(entry) || path.includes(`${join("acp", "tests")}`)) continue;
    out.push(path);
  }
  return out;
}

describe("gardă: fiecare apel de producție al motorului primește indicele", () => {
  it("runAcpAnalysis este apelat mereu cu priceIndex și engineVersion", () => {
    const files = sourceFiles("src");
    const callSites: { file: string; call: string }[] = [];

    for (const file of files) {
      const code = readFileSync(file, "utf8");
      if (file.endsWith(join("acp", "engine.ts"))) continue;
      let from = 0;
      for (;;) {
        const at = code.indexOf("runAcpAnalysis(", from);
        if (at === -1) break;
        // Extragem argumentele apelului cu numărare de paranteze, ca un apel
        // scurt fără obiect de opțiuni să nu poată trece nedetectat.
        let depth = 0;
        let end = at + "runAcpAnalysis".length;
        for (; end < code.length; end += 1) {
          const ch = code[end];
          if (ch === "(") depth += 1;
          else if (ch === ")") {
            depth -= 1;
            if (depth === 0) break;
          }
        }
        callSites.push({ file, call: code.slice(at, end + 1) });
        from = end + 1;
      }
    }

    expect(callSites.length).toBeGreaterThan(0);
    for (const site of callSites) {
      expect(site.call, `${site.file}: apel fără priceIndex`).toContain("priceIndex");
      expect(site.call, `${site.file}: apel fără engineVersion`).toContain("engineVersion");
    }
  });
});
