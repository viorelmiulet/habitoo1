/**
 * Retrimiterea portofoliului La Cheie după reactivarea agenției — logica pură.
 *
 * Documentația La Cheie: reactivarea agenției NU republică ofertele. CRM-ul
 * trebuie să retrimită fiecare ofertă ca STARE COMPLETĂ, cu o versiune mai mare.
 * Retrimiterea nu pornește niciodată automat: o cere explicit un om.
 */

/** Motivul retragerii locale, ca să știm ce se retrimite și ce nu. */
export const LACHEIE_WITHDRAW_REASON = {
  /** Retragere cerută de un om din fila Publicare — NU se retrimite. */
  user: "user",
  /** Retragere provocată de dezactivarea conexiunii — se retrimite la reactivare. */
  agencyDeactivated: "agency_deactivated",
} as const;

export type LaCheieWithdrawReason =
  (typeof LACHEIE_WITHDRAW_REASON)[keyof typeof LACHEIE_WITHDRAW_REASON];

export type LaCheieResendCandidate = {
  propertyId: string;
  enabled: boolean | null;
  withdrawReason: string | null;
};

/**
 * Se retrimit ofertele bifate pentru La Cheie și cele retrase de dezactivarea
 * conexiunii. O retragere cerută de un om rămâne retrasă.
 */
export function shouldResendLaCheiePublication(candidate: LaCheieResendCandidate): boolean {
  if (candidate.withdrawReason === LACHEIE_WITHDRAW_REASON.user) return false;
  if (candidate.withdrawReason === LACHEIE_WITHDRAW_REASON.agencyDeactivated) return true;
  return candidate.enabled === true;
}

export function selectLaCheieResendTargets(candidates: LaCheieResendCandidate[]): string[] {
  const ids: string[] = [];
  for (const candidate of candidates) {
    if (shouldResendLaCheiePublication(candidate) && !ids.includes(candidate.propertyId)) {
      ids.push(candidate.propertyId);
    }
  }
  return ids;
}

/* ------------------------------- throttling ------------------------------- */

/** Limita implicită de scrieri din documentație, când `/account` nu o raportează. */
export const LACHEIE_DEFAULT_WRITE_RATE = 60;

const WRITE_RATE_KEYS = [
  "write_rate",
  "writes_per_minute",
  "write_limit",
  "write_limit_per_minute",
  "rate_limit_write",
  "writes",
];

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value.trim(), 10);
    return parsed > 0 ? parsed : null;
  }
  return null;
}

/**
 * Limita reală de scrieri raportată de `GET /account`, oriunde o pune portalul
 * (rădăcină, `account`, `data`, `limits`, `rate_limits`). Fără o valoare validă
 * rămâne limita din documentație.
 */
export function parseLaCheieAccountWriteRate(body: unknown): number {
  const scopes: unknown[] = [];
  const push = (value: unknown) => {
    if (value && typeof value === "object") scopes.push(value);
  };
  push(body);
  const root = (body ?? {}) as Record<string, unknown>;
  for (const key of ["account", "data", "limits", "rate_limits", "rateLimits"]) push(root[key]);
  for (const key of ["account", "data"]) {
    const nested = (root[key] ?? {}) as Record<string, unknown>;
    for (const inner of ["limits", "rate_limits", "rateLimits"]) push(nested[inner]);
  }

  for (const scope of scopes) {
    const record = scope as Record<string, unknown>;
    for (const key of WRITE_RATE_KEYS) {
      const parsed = numeric(record[key]);
      if (parsed !== null) return Math.min(parsed, LACHEIE_DEFAULT_WRITE_RATE);
    }
  }
  return LACHEIE_DEFAULT_WRITE_RATE;
}

/** O ofertă pe cerere, la un ritm care nu depășește limita de scrieri pe minut. */
export function laCheieResendDelayMs(writeRate: number): number {
  const rate = Math.max(1, Math.min(writeRate || LACHEIE_DEFAULT_WRITE_RATE, LACHEIE_DEFAULT_WRITE_RATE));
  return Math.ceil(60_000 / rate);
}

/* ------------------------------ stări de job ------------------------------ */

export const LACHEIE_RESEND_ACTIVE_STATUSES = ["queued", "running"] as const;

export const LACHEIE_RESEND_AGENCY_INACTIVE_MESSAGE =
  "Agenția nu mai este activă la La Cheie: retrimiterea portofoliului s-a oprit.";

export const LACHEIE_RESEND_ALREADY_RUNNING_MESSAGE =
  "O retrimitere a portofoliului La Cheie este deja în curs pentru această agenție.";

export const LACHEIE_RESEND_NOTHING_TO_SEND_MESSAGE =
  "Nu există oferte La Cheie de retrimis pentru această agenție.";

export type LaCheieResendJobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

/**
 * Ofertele care eșuează individual NU transformă jobul în „failed”: el se
 * încheie „done”, cu numărul de eșecuri. Doar pierderea stării „active” a
 * agenției oprește și marchează jobul ca eșuat.
 */
export function laCheieResendFinalStatus(input: {
  cancelled: boolean;
  agencyActive: boolean;
}): LaCheieResendJobStatus {
  if (input.cancelled) return "cancelled";
  if (!input.agencyActive) return "failed";
  return "done";
}

/** Retragerile locale nu se mai reia la nesfârșit: limita de reîncercări 429. */
export const LACHEIE_RESEND_MAX_RATE_LIMIT_RETRIES = 5;
