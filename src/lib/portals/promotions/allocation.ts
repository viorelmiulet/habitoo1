/**
 * Promovări de portal — repartizarea pe agenție și pe agent (logică pură).
 *
 * Reguli:
 *  - un serviciu neactivat de agenție nu poate fi comandat de nimeni, nici de
 *    administrator, nici de Superadmin;
 *  - plafonul agenției (`agencyCap`) nu poate depăși rezerva reală de la portal;
 *    `null` = singurul plafon este rezerva portalului;
 *  - alocarea unui utilizator lipsă sau `null` = nelimitat în limita agenției;
 *  - consumul se atribuie agentului responsabil al proprietății;
 *  - dezactivarea, scăderea unei valori numerice și simpla recitire NU consumă
 *    nimic, deci nu sunt niciodată refuzate de aceste reguli.
 */

export type PromotionKind = "boolean" | "numeric";

/** Consumul real, citit de la portal, pentru un serviciu. */
export type PromotionUsage = {
  /** Consum per utilizator responsabil (locuri sau puncte Energy). */
  byUser: Map<string, number>;
  /** Consumul întregii agenții pe acest serviciu. */
  total: number;
  /** `true` când portalul nu a putut fi citit complet (cifre incomplete). */
  partial: boolean;
  /** Eroarea de citire, dacă există. */
  error: string | null;
};

export function emptyPromotionUsage(error: string | null = null): PromotionUsage {
  return { byUser: new Map(), total: 0, partial: error !== null, error };
}

/** Alocarea unui utilizator: `null` = nelimitat în limita agenției. */
export function promotionAllocationFor(
  allocations: Map<string, number | null>,
  userId: string,
): number | null {
  if (!allocations.has(userId)) return null;
  return allocations.get(userId) ?? null;
}

/**
 * Cât consumă în plus o modificare. Zero pentru dezactivare, scădere sau
 * retrimiterea aceleiași valori: recitirea stării nu costă nimic.
 */
export function promotionConsumption(
  kind: PromotionKind,
  current: boolean | number | null,
  next: boolean | number,
): number {
  if (kind === "numeric") {
    const target = Math.trunc(Number(next) || 0);
    const base = typeof current === "number" ? Math.max(current, 0) : 0;
    return Math.max(target - base, 0);
  }
  return next === true && current !== true ? 1 : 0;
}

export type PromotionCheck = { ok: true; consumes: number } | { ok: false; message: string };

export function promotionDisabledMessage(label: string): string {
  return `${label} nu este activat pentru agenție. Cere administratorului agenției să îl activeze din „Promovări Imobiliare.ro”.`;
}

export function promotionAgentLimitMessage(input: {
  label: string;
  kind: PromotionKind;
  used: number;
  limit: number;
}): string {
  const unit = input.kind === "numeric" ? "puncte" : "locuri";
  return `${input.label}: alocarea ta este epuizată (${input.used}/${input.limit} ${unit}). Cere administratorului agenției o alocare mai mare.`;
}

export function promotionAgencyLimitMessage(input: {
  label: string;
  kind: PromotionKind;
  used: number;
  limit: number;
}): string {
  const unit = input.kind === "numeric" ? "puncte" : "locuri";
  return `${input.label}: plafonul agenției este atins (${input.used}/${input.limit} ${unit}). Eliberează un loc de la altă ofertă sau mărește plafonul agenției.`;
}

export const PROMOTION_USAGE_UNKNOWN =
  "Consumul serviciului nu a putut fi citit de la Imobiliare.ro, deci activarea nu poate fi verificată acum.";

/**
 * Poarta unică: aplică regulile agenției peste o modificare de promovare.
 * Nu înlocuiește verificarea rezervei de la portal (`guardImobiliarePromotionChange`).
 */
export function checkPromotionAllocation(input: {
  label: string;
  kind: PromotionKind;
  enabled: boolean;
  agencyCap: number | null;
  allocation: number | null;
  usage: PromotionUsage;
  userId: string | null;
  current: boolean | number | null;
  next: boolean | number;
}): PromotionCheck {
  const consumes = promotionConsumption(input.kind, input.current, input.next);
  if (consumes <= 0) return { ok: true, consumes: 0 };

  if (!input.enabled) return { ok: false, message: promotionDisabledMessage(input.label) };

  const limited = input.allocation !== null || input.agencyCap !== null;
  if (limited && (input.usage.error !== null || input.usage.partial)) {
    return { ok: false, message: PROMOTION_USAGE_UNKNOWN };
  }

  const agentUsed = input.userId ? (input.usage.byUser.get(input.userId) ?? 0) : 0;
  if (input.allocation !== null && agentUsed + consumes > input.allocation) {
    return {
      ok: false,
      message: promotionAgentLimitMessage({
        label: input.label,
        kind: input.kind,
        used: agentUsed,
        limit: input.allocation,
      }),
    };
  }

  if (input.agencyCap !== null && input.usage.total + consumes > input.agencyCap) {
    return {
      ok: false,
      message: promotionAgencyLimitMessage({
        label: input.label,
        kind: input.kind,
        used: input.usage.total,
        limit: input.agencyCap,
      }),
    };
  }

  return { ok: true, consumes };
}

export type PromotionCapCheck = { ok: true } | { ok: false; message: string };

/** Plafonul agenției nu poate depăși rezerva totală de la portal. */
export function validatePromotionCap(input: {
  label: string;
  cap: number | null;
  poolTotal: number | null;
}): PromotionCapCheck {
  if (input.cap === null) return { ok: true };
  if (input.cap < 0) {
    return { ok: false, message: `${input.label}: plafonul nu poate fi negativ.` };
  }
  if (input.poolTotal === null) {
    return {
      ok: false,
      message: `${input.label}: Imobiliare.ro nu a raportat numărul de locuri, deci plafonul nu poate fi validat acum.`,
    };
  }
  if (input.cap > input.poolTotal) {
    return {
      ok: false,
      message: `${input.label}: plafonul agenției (${input.cap}) nu poate depăși cele ${input.poolTotal} locuri cumpărate la Imobiliare.ro.`,
    };
  }
  return { ok: true };
}

/** Cât a mai rămas dintr-o alocare; `null` = nelimitat în limita agenției. */
export function promotionRemaining(allocation: number | null, used: number): number | null {
  if (allocation === null) return null;
  return Math.max(allocation - used, 0);
}
