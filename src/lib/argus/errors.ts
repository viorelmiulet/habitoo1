/**
 * Erorile integrării Argus. Mesajele sunt sigure de afișat utilizatorului:
 * nu conțin chei, tokenuri sau corpuri brute de răspuns.
 */
export type ArgusErrorKind =
  /** Lipsește tokenul de aplicație sau cheia agenției. */
  | "config"
  /** Cheia API a fost refuzată de Argus. */
  | "auth"
  /** Cota lunară a contului Argus a fost depășită (HTTP 403). */
  | "quota"
  /** Limita de cereri a fost atinsă (HTTP 429 sau limita locală). */
  | "rate_limit"
  /** Rețea / timeout. */
  | "network"
  /** Orice alt refuz Argus. */
  | "rejected";

export const ARGUS_QUOTA_MESSAGE = "Cota lunară Argus a fost depășită";

export class ArgusError extends Error {
  readonly kind: ArgusErrorKind;
  readonly httpStatus: number | null;

  constructor(kind: ArgusErrorKind, message: string, httpStatus: number | null = null) {
    super(message);
    this.name = "ArgusError";
    this.kind = kind;
    this.httpStatus = httpStatus;
  }
}

export function argusErrorMessage(e: unknown): string {
  if (e instanceof ArgusError) return e.message;
  return "Serviciul Argus nu a putut fi contactat. Încearcă din nou.";
}
