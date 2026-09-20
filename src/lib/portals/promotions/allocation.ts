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
 *    nimic, deci nu sunt niciodată refuzate de aceste reguli;
 *  - consumul agenției vine de la contorul serviciului (portalul îl publică), deci
 *    o citire incompletă a anunțurilor NU blochează activările.
 */

export type PromotionKind = "boolean" | "numeric";

/** Consumul real, citit de la portal, pentru un serviciu. */
export type PromotionUsage = {
  /** Consum per utilizator; calculat doar pentru utilizatorii ceruți. */
  byUser: Map<string, number>;
  /** Consumul întregii agenții; `null` = portalul nu l-a raportat. */
  total: number | null;
  /** `true` când totalul vine direct de la contorul serviciului. */
  totalFromPortal: boolean;
  /** Utilizatorii pentru care consumul nu a putut fi calculat. */
  unknownUsers: string[];
  /** Eroarea de citire, dacă există. */
  error: string | null;
};

export function emptyPromotionUsage(error: string | null = null): PromotionUsage {
  return {
    byUser: new Map(),
    total: error === null ? 0 : null,
    totalFromPortal: false,
    unknownUsers: [],
    error,
  };
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
  "Consumul serviciului nu a putut fi citit de la Imobiliare.ro, deci plafonul agenției nu poate fi verificat acum.";

export function promotionUserUsageUnknownMessage(label: string): string {
  return `${label}: consumul ofertelor tale nu a putut fi citit de la Imobiliare.ro, deci alocarea ta nu poate fi verificată acum.`;
}

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

  if (input.allocation !== null) {
    if (!input.userId || input.usage.unknownUsers.includes(input.userId)) {
      return { ok: false, message: promotionUserUsageUnknownMessage(input.label) };
    }
    const agentUsed = input.usage.byUser.get(input.userId) ?? 0;
    if (agentUsed + consumes > input.allocation) {
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
  }

  if (input.agencyCap !== null) {
    if (input.usage.total === null) return { ok: false, message: PROMOTION_USAGE_UNKNOWN };
    if (input.usage.total + consumes > input.agencyCap) {
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

/* --------------------- retragerea surplusului la reducere ------------------- */

/** Un serviciu activ pe o ofertă, cu momentul activării (cel mai recent primul). */
export type PromotionHolding = {
  propertyId: string;
  userId: string | null;
  /** Locuri (1) sau puncte (n). */
  amount: number;
  /** Momentul activării, din jurnalul operațiunilor; `null` = necunoscut. */
  activatedAt: string | null;
};

export type PromotionWithdrawPlanItem = {
  propertyId: string;
  userId: string | null;
  /** Cât se eliberează. */
  amount: number;
  /** Valoarea la care coboară serviciul: `null` = dezactivare completă. */
  targetAmount: number | null;
};

/** Cel mai recent activat primul; activările fără dată se retrag ultimele. */
export function sortHoldingsNewestFirst(holdings: PromotionHolding[]): PromotionHolding[] {
  return [...holdings].sort((a, b) => {
    if (a.activatedAt === b.activatedAt) return 0;
    if (a.activatedAt === null) return 1;
    if (b.activatedAt === null) return -1;
    return a.activatedAt < b.activatedAt ? 1 : -1;
  });
}

/**
 * Ce se retrage dacă noile limite se salvează acum: mai întâi surplusul fiecărui
 * agent peste alocarea lui, apoi surplusul agenției peste plafon — de fiecare
 * dată cel mai recent activat primul.
 */
export function planPromotionWithdrawals(input: {
  kind: PromotionKind;
  holdings: PromotionHolding[];
  agencyCap: number | null;
  allocations: Map<string, number | null>;
}): PromotionWithdrawPlanItem[] {
  const ordered = sortHoldingsNewestFirst(input.holdings);
  const remaining = new Map(ordered.map((holding) => [holding, holding.amount]));
  const plan: PromotionWithdrawPlanItem[] = [];

  const cut = (holding: PromotionHolding, excess: number) => {
    const left = remaining.get(holding) ?? 0;
    if (left <= 0 || excess <= 0) return 0;
    const taken = Math.min(left, excess);
    const nextValue = left - taken;
    remaining.set(holding, nextValue);
    plan.push({
      propertyId: holding.propertyId,
      userId: holding.userId,
      amount: taken,
      targetAmount: input.kind === "numeric" && nextValue > 0 ? nextValue : null,
    });
    return taken;
  };

  // 1. Alocarea fiecărui agent.
  const byUser = new Map<string, PromotionHolding[]>();
  for (const holding of ordered) {
    if (!holding.userId) continue;
    byUser.set(holding.userId, [...(byUser.get(holding.userId) ?? []), holding]);
  }
  for (const [userId, holdings] of byUser) {
    const allocation = promotionAllocationFor(input.allocations, userId);
    if (allocation === null) continue;
    let used = holdings.reduce((sum, holding) => sum + (remaining.get(holding) ?? 0), 0);
    for (const holding of holdings) {
      if (used <= allocation) break;
      used -= cut(holding, used - allocation);
    }
  }

  // 2. Plafonul agenției, peste ce a rămas.
  if (input.agencyCap !== null) {
    let total = ordered.reduce((sum, holding) => sum + (remaining.get(holding) ?? 0), 0);
    for (const holding of ordered) {
      if (total <= input.agencyCap) break;
      total -= cut(holding, total - input.agencyCap);
    }
  }

  return plan;
}
