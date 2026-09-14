/**
 * Retry pentru erori tranzitorii (Stage 11).
 *
 * Regula de bază: reîncercăm numai operații de CITIRE sau apeluri la provider
 * care nu pot produce efecte secundare. Operațiile care pot crea duplicate
 * (mesaje, versiuni, înregistrări) NU trec niciodată prin `withRetry`.
 */
import { AiProviderError } from "../providers/types";

export type AiRetryClassification = {
  retryable: boolean;
  /** Motiv scurt, sigur pentru audit și tracing (fără detalii tehnice sensibile). */
  reason:
    | "provider_timeout"
    | "provider_temporary"
    | "provider_rate_limited"
    | "network"
    | "database_temporary"
    | "terminal";
};

const NETWORK_HINTS = [
  "fetch failed",
  "network",
  "socket",
  "econnreset",
  "etimedout",
  "enotfound",
];
const DB_HINTS = ["connection", "timeout", "temporarily unavailable", "too many connections", "503"];

function messageOf(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`.toLowerCase();
  return String(error ?? "").toLowerCase();
}

/** Decide dacă o eroare este tranzitorie. Nu expune niciodată detalii brute. */
export function classifyAiError(error: unknown): AiRetryClassification {
  if (error instanceof AiProviderError) {
    if (error.status === 504) return { retryable: true, reason: "provider_timeout" };
    if (error.status === 429) return { retryable: true, reason: "provider_rate_limited" };
    if (error.retryable) return { retryable: true, reason: "provider_temporary" };
    return { retryable: false, reason: "terminal" };
  }
  const text = messageOf(error);
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return { retryable: true, reason: "provider_timeout" };
  }
  if (NETWORK_HINTS.some((hint) => text.includes(hint))) {
    return { retryable: true, reason: "network" };
  }
  if (DB_HINTS.some((hint) => text.includes(hint))) {
    return { retryable: true, reason: "database_temporary" };
  }
  return { retryable: false, reason: "terminal" };
}

export type AiRetryAttempt = {
  attempt: number;
  reason: AiRetryClassification["reason"];
  delayMs: number;
};

export type AiRetryOptions = {
  /** Numărul total de încercări (implicit 3: una inițială + două reîncercări). */
  attempts?: number;
  /** Întârzierea de bază; crește exponențial. */
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (attempt: AiRetryAttempt) => void;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Execută `run`, reîncercând numai erorile clasificate ca tranzitorii.
 * Ultima eroare este re-aruncată neschimbată, ca apelantul să o traducă
 * în mesaj sigur pentru utilizator.
 */
export async function withRetry<T>(
  run: (attempt: number) => Promise<T>,
  options: AiRetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const baseDelayMs = options.baseDelayMs ?? 400;
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await run(attempt);
    } catch (error) {
      lastError = error;
      const classification = classifyAiError(error);
      if (!classification.retryable || attempt === attempts) break;
      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      options.onRetry?.({ attempt, reason: classification.reason, delayMs });
      await sleep(delayMs);
    }
  }
  throw lastError;
}
