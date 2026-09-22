/**
 * Abonamentul agenției: termen fix (30 de zile / 12 luni) și fereastră de grație
 * de 5 zile după expirare, în care contul rămâne funcțional.
 */
export const SUBSCRIPTION_TERMS = ["trial_14d", "trial_30d", "30d", "12m"] as const;
export type SubscriptionTerm = (typeof SUBSCRIPTION_TERMS)[number];

export const SUBSCRIPTION_TERM_LABELS: Record<SubscriptionTerm, string> = {
  trial_14d: "Trial 14 zile",
  trial_30d: "Trial 30 zile",
  "30d": "30 de zile",
  "12m": "12 luni",
};

/** Termenele care reprezintă o perioadă gratuită, nu un abonament plătit. */
export function isTrialTerm(term?: string | null): boolean {
  return term === "trial_14d" || term === "trial_30d";
}


/** Numărul de zile de grație după expirarea termenului. */
export const GRACE_DAYS = 5;

export type SubscriptionState =
  | { kind: "none" }
  | { kind: "active"; expiresAt: string; daysLeft: number }
  | { kind: "grace"; expiresAt: string; daysLeft: number }
  | { kind: "expired"; expiresAt: string };

export function subscriptionTermLabel(term?: string | null): string {
  return SUBSCRIPTION_TERMS.includes(term as SubscriptionTerm)
    ? SUBSCRIPTION_TERM_LABELS[term as SubscriptionTerm]
    : "Fără termen";
}


const DAY = 24 * 60 * 60 * 1000;

/** Starea abonamentului, calculată exclusiv din data de expirare. */
export function subscriptionState(
  org: { subscription_expires_at?: string | null } | null | undefined,
  now: number = Date.now(),
): SubscriptionState {
  const raw = org?.subscription_expires_at ?? null;
  if (!raw) return { kind: "none" };
  const expires = new Date(raw).getTime();
  if (Number.isNaN(expires)) return { kind: "none" };

  if (now < expires) {
    return { kind: "active", expiresAt: raw, daysLeft: Math.max(1, Math.ceil((expires - now) / DAY)) };
  }
  const graceEnd = expires + GRACE_DAYS * DAY;
  if (now < graceEnd) {
    return {
      kind: "grace",
      expiresAt: raw,
      daysLeft: Math.max(1, Math.ceil((graceEnd - now) / DAY)),
    };
  }
  return { kind: "expired", expiresAt: raw };
}

/** Text pentru banda de avertizare din aplicație. */
export function graceBannerText(daysLeft: number): string {
  return daysLeft === 1
    ? "Contul va fi suspendat mâine"
    : `Contul va fi suspendat în ${daysLeft} zile`;
}

/** Titlul contextual: perioadă gratuită încheiată vs. abonament plătit expirat. */
export function graceHeadline(isTrial?: boolean | null): string {
  return isTrial ? "Perioada ta gratuită s-a încheiat" : "Abonamentul a expirat";
}

