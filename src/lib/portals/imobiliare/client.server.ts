/**
 * Clientul HTTP Imobiliare.ro. Rulează exclusiv server-side.
 *
 * Tokenul de acces apare doar în headerul `Authorization`: nu se loghează, nu
 * se returnează în UI și nu intră în audit. Corpul răspunsului portalului se
 * păstrează integral pentru jurnalizare (sanitizat de secrete în `errors.ts`).
 */
import { PortalError } from "../errors";
import { IMOBILIARE_BASE_URL } from "./config";
import {
  classifyImobiliareNetworkError,
  classifyImobiliareStatus,
  describeImobiliareValidation,
  IMOBILIARE_MAX_ATTEMPTS,
  type ImobiliareClassification,
} from "./http";

export type ImobiliareResponse = {
  ok: boolean;
  status: number;
  body: unknown;
  attempts: number;
  durationMs: number;
  classification: ImobiliareClassification | null;
};

export type ImobiliareRequestInput = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  accessToken?: string | null;
  /** Cheia de limitare locală: o conexiune = o agenție. */
  connectionKey: string;
  timeoutMs?: number;
};

const REQUEST_TIMEOUT_MS = 30_000;
export const IMOBILIARE_WRITE_LIMIT_PER_MINUTE = 60;
export const IMOBILIARE_READ_LIMIT_PER_MINUTE = 120;

type Counter = { count: number; resetAt: number };
const readCounters = new Map<string, Counter>();
const writeCounters = new Map<string, Counter>();

function hitCounter(store: Map<string, Counter>, key: string, limit: number): boolean {
  const now = Date.now();
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > limit;
}

/** Scrierile pe același anunț se serializează: fără race conditions. */
const locks = new Map<string, Promise<unknown>>();

export async function withImobiliareWriteLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const current = previous.then(fn, fn);
  locks.set(
    key,
    current.catch(() => undefined),
  );
  return current;
}

const PRIVATE_HOST =
  /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|metadata\.)/i;

export function assertSafeImobiliareUrl(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new PortalError("INVALID_REQUEST", "Adresa API Imobiliare.ro nu este un URL valid.");
  }
  if (url.protocol !== "https:") {
    throw new PortalError("INVALID_REQUEST", "Adresa API Imobiliare.ro trebuie să folosească HTTPS.");
  }
  if (PRIVATE_HOST.test(url.hostname)) {
    throw new PortalError("INVALID_REQUEST", "Adresa API Imobiliare.ro nu este publică.");
  }
  return url;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 1000);
  }
}

export async function imobiliareRequest(
  input: ImobiliareRequestInput,
): Promise<ImobiliareResponse> {
  const base = assertSafeImobiliareUrl(IMOBILIARE_BASE_URL);
  const url = new URL(input.path, base);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const isWrite = input.method !== "GET";
  const limited = isWrite
    ? hitCounter(writeCounters, input.connectionKey, IMOBILIARE_WRITE_LIMIT_PER_MINUTE)
    : hitCounter(readCounters, input.connectionKey, IMOBILIARE_READ_LIMIT_PER_MINUTE);
  if (limited) {
    throw new PortalError(
      "RATE_LIMIT",
      isWrite
        ? `S-a atins limita locală de ${IMOBILIARE_WRITE_LIMIT_PER_MINUTE} scrieri pe minut către Imobiliare.ro.`
        : `S-a atins limita locală de ${IMOBILIARE_READ_LIMIT_PER_MINUTE} citiri pe minut către Imobiliare.ro.`,
    );
  }

  const startedAt = Date.now();
  let attempt = 0;
  let last: ImobiliareResponse | null = null;

  while (attempt < IMOBILIARE_MAX_ATTEMPTS) {
    attempt += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? REQUEST_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (input.accessToken) headers["Authorization"] = `Bearer ${input.accessToken}`;
      if (input.body !== undefined) headers["Content-Type"] = "application/json";
      const response = await fetch(url.toString(), {
        method: input.method,
        headers,
        ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
        signal: controller.signal,
      });
      const body = await readBody(response);
      const baseClassification = classifyImobiliareStatus({
        status: response.status,
        attempt,
        retryAfter: response.headers.get("retry-after"),
      });
      const details =
        baseClassification.code === "INVALID_REQUEST" ? describeImobiliareValidation(body) : null;
      const classification = details
        ? { ...baseClassification, message: `${baseClassification.message} (${details})` }
        : baseClassification;
      last = {
        ok: classification.action === "ok",
        status: response.status,
        body,
        attempts: attempt,
        durationMs: Date.now() - startedAt,
        classification,
      };
      if (classification.action === "ok") return last;
      if (classification.action === "retry_same" || classification.action === "retry_after") {
        if (classification.waitMs > 0) await sleep(classification.waitMs);
        continue;
      }
      return last;
    } catch (error) {
      const timeout = error instanceof Error && error.name === "AbortError";
      const classification = classifyImobiliareNetworkError({ attempt, timeout });
      last = {
        ok: false,
        status: 0,
        body: null,
        attempts: attempt,
        durationMs: Date.now() - startedAt,
        classification,
      };
      if (classification.action === "stop") return last;
      if (classification.waitMs > 0) await sleep(classification.waitMs);
    } finally {
      clearTimeout(timer);
    }
  }

  return (
    last ?? {
      ok: false,
      status: 0,
      body: null,
      attempts: attempt,
      durationMs: Date.now() - startedAt,
      classification: classifyImobiliareNetworkError({ attempt, timeout: true }),
    }
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.min(ms, 30_000)));
}
