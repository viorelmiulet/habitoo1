/**
 * Planurile de abonament ale agențiilor: limita de agenți și prețurile reale.
 * Limitele trebuie să rămână sincronizate cu funcția DB `public.plan_agent_limit`.
 * Planul `unlimited` nu are limită de agenți (`null`), nu un număr foarte mare.
 */
export const PLAN_KEYS = ["basic", "pro", "unlimited"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export const PLAN_LABELS: Record<PlanKey, string> = {
  basic: "Basic",
  pro: "Pro",
  unlimited: "Unlimited",
};

/** `null` = fără limită de agenți. */
export const PLAN_AGENT_LIMITS: Record<PlanKey, number | null> = {
  basic: 3,
  pro: 10,
  unlimited: null,
};

/** Prețuri în euro: tariful lunar și tariful lunar echivalent la plata anuală (-50%). */
export const PLAN_PRICES: Record<PlanKey, { monthly: number; annualMonthly: number }> = {
  basic: { monthly: 10, annualMonthly: 5 },
  pro: { monthly: 20, annualMonthly: 10 },
  unlimited: { monthly: 100, annualMonthly: 50 },
};

/** Totalul facturat pe an la plata anuală. */
export function planAnnualTotal(plan?: string | null): number {
  return PLAN_PRICES[normalizePlan(plan)].annualMonthly * 12;
}

export function normalizePlan(plan?: string | null): PlanKey {
  const value = (plan ?? "").toLowerCase();
  if (value === "pro" || value === "growth") return "pro";
  // Valorile istorice „business”/„enterprise” devin planul Unlimited.
  if (value === "unlimited" || value === "business" || value === "enterprise") return "unlimited";
  return "basic";
}

/** Limita de agenți a planului; `null` înseamnă fără limită. */
export function planAgentLimit(plan?: string | null): number | null {
  return PLAN_AGENT_LIMITS[normalizePlan(plan)];
}

export function planLabel(plan?: string | null): string {
  return PLAN_LABELS[normalizePlan(plan)];
}

/** Textul limitei pentru interfață: „fără limită” la Unlimited. */
export function planAgentLimitLabel(plan?: string | null): string {
  const limit = planAgentLimit(plan);
  return limit === null ? "fără limită" : `${limit} agenți`;
}

/**
 * Eticheta pentru numărul de locuri stocat în `organizations.max_users`. Planul
 * Unlimited este salvat ca sentinelă foarte mare, deci nu afișăm cifra brută.
 */
export const UNLIMITED_SEATS_SENTINEL = 1_000_000;

export function seatLimitLabel(maxUsers?: number | null): string {
  if (maxUsers == null || maxUsers >= UNLIMITED_SEATS_SENTINEL) return "fără limită";
  return String(maxUsers);
}

/** Tariful aplicat în funcție de termenul abonamentului (30 zile = lunar, 12 luni = anual). */
export function planPriceLabel(plan?: string | null, term?: string | null): string {
  const price = PLAN_PRICES[normalizePlan(plan)];
  if (term === "12m") {
    return `${price.annualMonthly}€/lună · facturat anual, ${price.annualMonthly * 12}€/an`;
  }
  if (term === "30d") return `${price.monthly}€/lună`;
  return `${price.monthly}€/lună sau ${price.annualMonthly}€/lună anual`;
}

/** Următorul plan superior, pentru mesajul de upgrade (fără flux de plată). */
export function nextPlan(plan?: string | null): PlanKey | null {
  const current = normalizePlan(plan);
  if (current === "basic") return "pro";
  if (current === "pro") return "unlimited";
  return null;
}
