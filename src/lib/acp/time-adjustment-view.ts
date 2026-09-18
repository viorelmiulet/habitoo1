/**
 * Prezentarea ajustării în timp în interfață (parte pură, fără rețea).
 *
 * Regula de afișare este strictă: pentru analizele calculate cu motorul v1 nu se
 * afișează NIMIC legat de ajustarea în timp — ele arată exact ca înainte. Pentru
 * v2 se arată indicele folosit, caracterul lui național, trimestrul la care se
 * oprește ajustarea (când e plafonată) și câte comparabile au fost ajustate.
 */
import { engineSupportsTimeAdjustment, normalizeAcpEngineVersion } from "./engine-version";
import type { AcpTimeAdjustment, AcpTimeAdjustmentSummary } from "./time-adjustment";

export type AcpTimeAdjustmentView = {
  analysisQuarter: string;
  /** Sursa, setul de date, seria și baza indicelui; null când indicele lipsește. */
  indexLine: string | null;
  /** Ultimul trimestru publicat al indicelui, dacă se cunoaște. */
  newestQuarter: string | null;
  /** Avertisment obligatoriu: indicele este național. */
  nationalCaveat: string;
  /** Trimestrul la care s-a oprit ajustarea; null când nu a fost plafonată. */
  clampedTo: string | null;
  clampLine: string | null;
  appliedCount: number;
  skippedCount: number;
  countsLine: string;
  note: string;
  /** false când indicele nu este disponibil: nicio ajustare nu s-a aplicat. */
  indexAvailable: boolean;
};

export type AcpComparableTimeAdjustmentView = {
  applied: boolean;
  originalPrice: number | null;
  comparableQuarter: string | null;
  usedQuarter: string | null;
  ratio: number | null;
  adjustedPrice: number | null;
  /** Motivul, în română simplă, pentru un comparabil lăsat neajustat. */
  reason: string;
};

/** Eticheta versiunii de metodologie, afișată pe analiză și în istoric. */
export function acpEngineVersionLabel(engineVersion: number | null | undefined): string {
  const version = normalizeAcpEngineVersion(engineVersion);
  return engineSupportsTimeAdjustment(version)
    ? `Metodologie v${version} · cu ajustare în timp`
    : `Metodologie v${version}`;
}

/** Blocul de nivel analiză. `null` înseamnă „nu afișa nimic" (motor v1). */
export function buildAcpTimeAdjustmentView(input: {
  engineVersion: number | null | undefined;
  summary: AcpTimeAdjustmentSummary | null | undefined;
}): AcpTimeAdjustmentView | null {
  if (!engineSupportsTimeAdjustment(normalizeAcpEngineVersion(input.engineVersion))) return null;
  const summary = input.summary;
  if (!summary) return null;

  const index = summary.index;
  const clampLine = summary.clampedTo
    ? `Indicele este publicat până la ${summary.clampedTo}; ajustarea se oprește acolo și nu extrapolează mai departe.`
    : null;
  const countsLine =
    summary.skippedCount === 0
      ? `${summary.appliedCount} comparabile ajustate, niciunul neajustat.`
      : `${summary.appliedCount} comparabile ajustate, ${summary.skippedCount} neajustate (motivul este afișat pe fiecare).`;

  return {
    analysisQuarter: summary.analysisQuarter,
    indexLine: index
      ? `${index.source} · ${index.dataset} · seria „${index.series}" · bază ${index.baseLabel}`
      : null,
    newestQuarter: index?.newestQuarter ?? null,
    nationalCaveat:
      "Indicele este NAȚIONAL (România): nu reflectă evoluția unei localități sau a unui cartier anume.",
    clampedTo: summary.clampedTo,
    clampLine,
    appliedCount: summary.appliedCount,
    skippedCount: summary.skippedCount,
    countsLine,
    note: summary.note,
    indexAvailable: index !== null,
  };
}

/** Ajustarea unui comparabil. `null` înseamnă „nu afișa nimic" (motor v1). */
export function buildAcpComparableTimeAdjustmentView(input: {
  engineVersion: number | null | undefined;
  timeAdjustment: AcpTimeAdjustment | null | undefined;
}): AcpComparableTimeAdjustmentView | null {
  if (!engineSupportsTimeAdjustment(normalizeAcpEngineVersion(input.engineVersion))) return null;
  const adjustment = input.timeAdjustment;
  if (!adjustment) return null;
  return {
    applied: adjustment.applied,
    originalPrice: adjustment.originalPrice,
    comparableQuarter: adjustment.comparableQuarter,
    usedQuarter: adjustment.usedQuarter,
    ratio: adjustment.ratio,
    adjustedPrice: adjustment.adjustedPrice,
    reason: adjustment.reason,
  };
}
