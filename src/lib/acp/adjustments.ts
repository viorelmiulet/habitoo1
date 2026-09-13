/**
 * Ajustări ACP: corecții transparente aplicate prețului unui comparabil pentru
 * a-l aduce la caracteristicile proprietății analizate.
 *
 * Reguli de bază:
 *  - fiecare ajustare este explicabilă: factor, bază de calcul, procent/sumă;
 *  - dacă un factor nu poate fi calculat din datele existente, NU se aplică
 *    nicio ajustare (nu inventăm valori);
 *  - procentele sunt centralizate mai jos și documentate, nu împrăștiate în cod;
 *  - suprafața se ajustează cu prețul real pe metru pătrat al comparabilului
 *    (derivat din date), nu cu un procent arbitrar.
 */
import type { AcpSubject } from "./scoring";
import { normalizeText } from "./scoring";
import { pricePerSqm } from "./statistics";

/** Factorii de ajustare recunoscuți. */
export const ACP_ADJUSTMENT_FACTORS = [
  "area",
  "rooms",
  "floor",
  "year",
  "condition",
  "parking",
  "balcony",
  "furnished",
] as const;

export type AcpAdjustmentFactor = (typeof ACP_ADJUSTMENT_FACTORS)[number];

export const ACP_ADJUSTMENT_LABELS: Record<AcpAdjustmentFactor, string> = {
  area: "Suprafață utilă",
  rooms: "Număr camere",
  floor: "Etaj",
  year: "An construcție",
  condition: "Stare",
  parking: "Parcare",
  balcony: "Balcon / terasă",
  furnished: "Mobilare",
};

/**
 * Parametrii ajustărilor. Valorile sunt convenții de evaluare uzuale pe piața
 * rezidențială din România și pot fi modificate într-un singur loc.
 */
export const ACP_ADJUSTMENT_CONFIG = {
  /** Camerele se ajustează DOAR când suprafața lipsește (altfel s-ar dubla). */
  roomsPercentPerRoom: 4,
  roomsMaxPercent: 12,
  /** Diferența de etaj. */
  floorPercentPerLevel: 1.5,
  floorMaxPercent: 6,
  /** Penalizare suplimentară pentru nepotrivire parter / ultim etaj. */
  groundFloorPercent: 2,
  topFloorPercent: 1.5,
  /** Vechimea construcției. */
  yearPercentPerYear: 0.15,
  yearMaxPercent: 8,
  /** Diferență de stare, pe pas din clasificarea internă. */
  conditionPercentPerRank: 3,
  conditionMaxPercent: 12,
  /** Dotări binare. */
  parkingPercent: 3,
  balconyPercent: 1.5,
  furnishedPercent: 2,
  /** Prag minim (EUR) sub care o ajustare devine nesemnificativă. */
  minimumAmount: 50,
} as const;

/** Ordinea stărilor folosită pentru distanța dintre ele (aceeași ca la scoring). */
const CONDITION_RANK: Record<string, number> = {
  "la cheie": 5,
  nou: 5,
  new: 5,
  renovat: 4,
  renovated: 4,
  "foarte buna": 4,
  buna: 3,
  good: 3,
  mobilat: 3,
  medie: 2,
  average: 2,
  nefinisat: 1,
  "necesita renovare": 1,
  "needs renovation": 1,
};

export type AcpAdjustment = {
  factor: AcpAdjustmentFactor;
  label: string;
  /** Explicația în limbaj natural, afișabilă direct în interfață. */
  basis: string;
  /** Procent aplicat prețului comparabilului (null când ajustarea e în sumă). */
  percent: number | null;
  /** Suma cu semn: pozitivă când comparabilul valorează mai puțin decât ținta. */
  amount: number;
};

export type AcpAdjustmentResult = {
  adjustments: AcpAdjustment[];
  /** Suma totală a ajustărilor. */
  totalAmount: number;
  /** Procentul total față de prețul comparabilului. */
  totalPercent: number | null;
  /** Prețul comparabilului corectat la caracteristicile țintei. */
  adjustedPrice: number | null;
  adjustedPricePerSqm: number | null;
  /** Factori care nu au putut fi calculați din lipsă de date. */
  skipped: AcpAdjustmentFactor[];
};

function num(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampPercent(value: number, max: number): number {
  return Math.max(-max, Math.min(max, value));
}

/**
 * Calculează ajustările pentru un comparabil față de proprietatea analizată.
 * `candidate.price` este obligatoriu; fără preț nu există ajustare posibilă.
 */
export function calculateAdjustments(
  target: AcpSubject,
  candidate: AcpSubject,
): AcpAdjustmentResult {
  const adjustments: AcpAdjustment[] = [];
  const skipped: AcpAdjustmentFactor[] = [];
  const price = num(candidate.price);

  if (price === null || price <= 0) {
    return {
      adjustments: [],
      totalAmount: 0,
      totalPercent: null,
      adjustedPrice: null,
      adjustedPricePerSqm: null,
      skipped: [...ACP_ADJUSTMENT_FACTORS],
    };
  }

  const pct = (factor: AcpAdjustmentFactor, percent: number, basis: string) => {
    const amount = round2((price * percent) / 100);
    if (Math.abs(amount) < ACP_ADJUSTMENT_CONFIG.minimumAmount) {
      skipped.push(factor);
      return;
    }
    adjustments.push({
      factor,
      label: ACP_ADJUSTMENT_LABELS[factor],
      basis,
      percent: round2(percent),
      amount,
    });
  };

  // 1. Suprafață — ajustare derivată din datele reale (preț/mp al comparabilului).
  const targetArea = num(target.usableArea);
  const candidateArea = num(candidate.usableArea);
  const candidatePpsm = num(candidate.pricePerSqm) ?? pricePerSqm(price, candidateArea);
  let areaAdjusted = false;
  if (targetArea !== null && candidateArea !== null && candidatePpsm !== null) {
    const diff = round2(targetArea - candidateArea);
    const amount = round2(diff * candidatePpsm);
    if (Math.abs(amount) >= ACP_ADJUSTMENT_CONFIG.minimumAmount) {
      adjustments.push({
        factor: "area",
        label: ACP_ADJUSTMENT_LABELS.area,
        basis: `${diff > 0 ? "+" : ""}${diff} mp × ${candidatePpsm} / mp (prețul pe mp al comparabilului)`,
        percent: round2((amount / price) * 100),
        amount,
      });
    } else {
      skipped.push("area");
    }
    areaAdjusted = true;
  } else {
    skipped.push("area");
  }

  // 2. Camere — doar când suprafața nu a putut fi ajustată (evită dubla numărare).
  const targetRooms = num(target.rooms);
  const candidateRooms = num(candidate.rooms);
  if (!areaAdjusted && targetRooms !== null && candidateRooms !== null) {
    const diff = targetRooms - candidateRooms;
    if (diff !== 0) {
      const percent = clampPercent(
        diff * ACP_ADJUSTMENT_CONFIG.roomsPercentPerRoom,
        ACP_ADJUSTMENT_CONFIG.roomsMaxPercent,
      );
      pct("rooms", percent, `${diff > 0 ? "+" : ""}${diff} camere față de comparabil`);
    }
  } else if (targetRooms === null || candidateRooms === null) {
    skipped.push("rooms");
  }

  // 3. Etaj.
  const targetFloor = num(target.floor);
  const candidateFloor = num(candidate.floor);
  if (targetFloor !== null && candidateFloor !== null) {
    let percent = clampPercent(
      (targetFloor - candidateFloor) * ACP_ADJUSTMENT_CONFIG.floorPercentPerLevel,
      ACP_ADJUSTMENT_CONFIG.floorMaxPercent,
    );
    const groundParts: string[] = [`etaj ${targetFloor} față de ${candidateFloor}`];
    if (targetFloor === 0 && candidateFloor !== 0) {
      percent -= ACP_ADJUSTMENT_CONFIG.groundFloorPercent;
      groundParts.push("ținta este la parter");
    } else if (candidateFloor === 0 && targetFloor !== 0) {
      percent += ACP_ADJUSTMENT_CONFIG.groundFloorPercent;
      groundParts.push("comparabilul este la parter");
    }
    const targetTop = num(target.totalFloors);
    const candidateTop = num(candidate.totalFloors);
    if (targetTop !== null && candidateTop !== null) {
      const targetIsTop = targetFloor === targetTop;
      const candidateIsTop = candidateFloor === candidateTop;
      if (targetIsTop && !candidateIsTop) {
        percent -= ACP_ADJUSTMENT_CONFIG.topFloorPercent;
        groundParts.push("ținta este la ultimul etaj");
      } else if (candidateIsTop && !targetIsTop) {
        percent += ACP_ADJUSTMENT_CONFIG.topFloorPercent;
        groundParts.push("comparabilul este la ultimul etaj");
      }
    }
    if (percent !== 0) pct("floor", percent, groundParts.join(", "));
  } else {
    skipped.push("floor");
  }

  // 4. An construcție.
  const targetYear = num(target.constructionYear);
  const candidateYear = num(candidate.constructionYear);
  if (targetYear !== null && candidateYear !== null) {
    const diff = targetYear - candidateYear;
    if (diff !== 0) {
      const percent = clampPercent(
        diff * ACP_ADJUSTMENT_CONFIG.yearPercentPerYear,
        ACP_ADJUSTMENT_CONFIG.yearMaxPercent,
      );
      pct("year", percent, `${Math.abs(diff)} ani diferență de vechime`);
    }
  } else {
    skipped.push("year");
  }

  // 5. Stare.
  const targetCondition = CONDITION_RANK[normalizeText(target.condition)];
  const candidateCondition = CONDITION_RANK[normalizeText(candidate.condition)];
  if (targetCondition !== undefined && candidateCondition !== undefined) {
    const diff = targetCondition - candidateCondition;
    if (diff !== 0) {
      const percent = clampPercent(
        diff * ACP_ADJUSTMENT_CONFIG.conditionPercentPerRank,
        ACP_ADJUSTMENT_CONFIG.conditionMaxPercent,
      );
      pct("condition", percent, `stare ${target.condition} vs ${candidate.condition}`);
    }
  } else {
    skipped.push("condition");
  }

  // 6–8. Dotări binare.
  const binary: { factor: AcpAdjustmentFactor; percent: number; key: keyof AcpSubject }[] = [
    { factor: "parking", percent: ACP_ADJUSTMENT_CONFIG.parkingPercent, key: "parking" },
    { factor: "balcony", percent: ACP_ADJUSTMENT_CONFIG.balconyPercent, key: "balcony" },
    { factor: "furnished", percent: ACP_ADJUSTMENT_CONFIG.furnishedPercent, key: "furnished" },
  ];
  for (const item of binary) {
    const t = target[item.key];
    const c = candidate[item.key];
    if (typeof t !== "boolean" || typeof c !== "boolean") {
      skipped.push(item.factor);
      continue;
    }
    if (t === c) continue;
    const percent = t ? item.percent : -item.percent;
    pct(
      item.factor,
      percent,
      t
        ? `ținta are ${ACP_ADJUSTMENT_LABELS[item.factor].toLowerCase()}, comparabilul nu`
        : `comparabilul are ${ACP_ADJUSTMENT_LABELS[item.factor].toLowerCase()}, ținta nu`,
    );
  }

  const totalAmount = round2(adjustments.reduce((sum, a) => sum + a.amount, 0));
  const adjustedPrice = round2(price + totalAmount);
  return {
    adjustments,
    totalAmount,
    totalPercent: round2((totalAmount / price) * 100),
    adjustedPrice,
    adjustedPricePerSqm: pricePerSqm(adjustedPrice, targetArea),
    skipped,
  };
}
