/**
 * Planurile de abonament ale agențiilor și limita de agenți pentru fiecare.
 * Limitele trebuie să rămână sincronizate cu funcția DB `public.plan_agent_limit`.
 */
export const PLAN_KEYS = ["basic", "pro", "business"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export const PLAN_LABELS: Record<PlanKey, string> = {
  basic: "Basic",
  pro: "Pro",
  business: "Business",
};

export const PLAN_AGENT_LIMITS: Record<PlanKey, number> = {
  basic: 3,
  pro: 10,
  business: 30,
};

export function normalizePlan(plan?: string | null): PlanKey {
  const value = (plan ?? "").toLowerCase();
  if (value === "pro" || value === "growth") return "pro";
  if (value === "business" || value === "enterprise") return "business";
  return "basic";
}

export function planAgentLimit(plan?: string | null): number {
  return PLAN_AGENT_LIMITS[normalizePlan(plan)];
}

export function planLabel(plan?: string | null): string {
  return PLAN_LABELS[normalizePlan(plan)];
}

/** Următorul plan superior, pentru mesajul de upgrade (fără flux de plată). */
export function nextPlan(plan?: string | null): PlanKey | null {
  const current = normalizePlan(plan);
  if (current === "basic") return "pro";
  if (current === "pro") return "business";
  return null;
}
