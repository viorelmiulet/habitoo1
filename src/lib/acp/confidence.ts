/**
 * Confidence score ACP: determinist, explicabil, fără AI.
 *
 * Se compune din trei părți documentate:
 *  1. cantitate  (max 40p) — câte comparabile utile există;
 *  2. calitate   (max 35p) — cât de similare sunt cu proprietatea analizată;
 *  3. dispersie  (max 25p) — cât de strâns este intervalul de preț pe mp.
 *
 * Sub numărul minim de comparabile scorul este plafonat, ca să nu sugerăm o
 * precizie pe care datele nu o susțin.
 */
import { ACP_THRESHOLDS } from "./config";
import { percentile } from "./statistics";

export const ACP_CONFIDENCE_CONFIG = {
  /** Numărul de comparabile la care componenta de cantitate este maximă. */
  idealCount: 8,
  /** Sub acest număr de comparabile, scorul total este plafonat. */
  minimumCount: 3,
  cappedScore: 40,
  weights: { quantity: 40, quality: 35, dispersion: 25 },
  /** Coeficient de variație (IQR / mediană) peste care dispersia dă 0 puncte. */
  maxDispersion: 0.35,
} as const;

export type ConfidenceInput = {
  /** Comparabilele folosite efectiv în statistică (fără outlieri/excluse). */
  usedCount: number;
  /** Scorurile de similaritate ale comparabilelor folosite. */
  similarityScores: readonly number[];
  /** Preț pe mp ajustat pentru comparabilele folosite. */
  pricePerSqmValues: readonly number[];
};

export type ConfidenceResult = {
  score: number;
  quantity: number;
  quality: number;
  dispersion: number;
  /** Coeficientul de variație folosit (null când nu poate fi calculat). */
  dispersionRatio: number | null;
  capped: boolean;
  /** Explicații afișabile în interfață. */
  notes: string[];
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function calculateConfidence(input: ConfidenceInput): ConfidenceResult {
  const cfg = ACP_CONFIDENCE_CONFIG;
  const notes: string[] = [];

  const quantity = round2(
    (Math.min(input.usedCount, cfg.idealCount) / cfg.idealCount) * cfg.weights.quantity,
  );
  notes.push(`${input.usedCount} comparabile folosite din ${cfg.idealCount} ideale.`);

  const sims = input.similarityScores.filter((v) => Number.isFinite(v));
  let quality = 0;
  if (sims.length > 0) {
    const avg = sims.reduce((a, b) => a + b, 0) / sims.length;
    const span = 100 - ACP_THRESHOLDS.secondary;
    const ratio = clamp((avg - ACP_THRESHOLDS.secondary) / span, 0, 1);
    quality = round2(ratio * cfg.weights.quality);
    notes.push(`Similaritate medie ${round2(avg)} din 100.`);
  } else {
    notes.push("Fără scoruri de similaritate disponibile.");
  }

  const ppsm = input.pricePerSqmValues.filter((v) => Number.isFinite(v) && v > 0);
  let dispersion = 0;
  let dispersionRatio: number | null = null;
  if (ppsm.length >= 4) {
    const q1 = percentile(ppsm, 0.25);
    const q3 = percentile(ppsm, 0.75);
    const med = percentile(ppsm, 0.5);
    if (q1 !== null && q3 !== null && med !== null && med > 0) {
      dispersionRatio = round2((q3 - q1) / med);
      const ratio = clamp(1 - dispersionRatio / cfg.maxDispersion, 0, 1);
      dispersion = round2(ratio * cfg.weights.dispersion);
      notes.push(`Dispersia prețului pe mp (IQR / mediană): ${dispersionRatio}.`);
    }
  } else {
    notes.push("Prea puține valori pentru a măsura dispersia prețului pe mp.");
  }

  let score = round2(quantity + quality + dispersion);
  let capped = false;
  if (input.usedCount < cfg.minimumCount) {
    capped = score > cfg.cappedScore;
    score = Math.min(score, cfg.cappedScore);
    notes.push(
      `Sub ${cfg.minimumCount} comparabile, încrederea este plafonată la ${cfg.cappedScore}.`,
    );
  }

  return { score, quantity, quality, dispersion, dispersionRatio, capped, notes };
}
