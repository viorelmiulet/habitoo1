/**
 * Clientul HTTP La Cheie. Rulează exclusiv server-side.
 *
 * Cheia API nu este niciodată logată, returnată sau inclusă în audit: singurul
 * loc în care apare este headerul `Authorization` al cererii.
 *
 * Garanții implementate aici:
 *  - gard de mediu: în producție nu pleacă nimic până la confirmarea activării;
 *  - SSRF guard: doar HTTPS către gazde publice (HTTP local doar în dezvoltare);
 *  - retry pentru timeout/5xx/429 cu EXACT aceeași versiune și același corp;
 *  - 409 nu se reia automat: se raportează conflictul pentru reconcile;
 *  - limite locale 60 scrieri / 120 citiri pe minut și corp maximum 1 MiB;
 *  - scrierile pe același external_id sunt serializate.
 */
import { PortalError } from "../errors";
import {
  LACHEIE_READ_LIMIT_PER_MINUTE,
  LACHEIE_SOURCE_VERSION_HEADER,
  LACHEIE_WRITE_LIMIT_PER_MINUTE,
  type LaCheieEnvironment,
} from "./config";
import {
  classifyLaCheieNetworkError,
  classifyLaCheieStatus,
  LACHEIE_MAX_ATTEMPTS,
  type LaCheieClassification,
} from "./http";
import { exceedsLaCheieBodyLimit } from "./mapper";
import { acceptedVersionFromConflict } from "./version";

export type LaCheieRequestConfig = {
  baseUrl: string;
  apiKey: string;
  environment: LaCheieEnvironment;
  /** Cheia de limitare locală: o conexiune = o agenție + un mediu. */
  connectionKey: string;
};

export type LaCheieResponse = {
  ok: boolean;
  status: number;
  body: unknown;
  attempts: number;
  durationMs: number;
  /** Setat doar pentru 409. */
  conflict?: { acceptedVersion: string | null };
  classification: LaCheieClassification | null;
};

const REQUEST_TIMEOUT_MS = 15_000;

/* ------------------------------- rate limits ------------------------------ */

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

/* --------------------------- serializare scrieri -------------------------- */

const locks = new Map<string, Promise<unknown>>();

/** Scrierile pe același external_id se execută una după alta. */
export async function withLaCheieWriteLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const current = previous.then(fn, fn);
  locks.set(
    key,
    current.catch(() => undefined),
  );
  try {
    return await current;
  } finally {
    if (locks.get(key) === current || locks.get(key) !== undefined) {
      // Eliberăm doar dacă nu s-a înlănțuit altă scriere între timp.
      void current.catch(() => undefined).then(() => undefined);
    }
  }
}

/* ---------------------------------- URL ---------------------------------- */

const PRIVATE_HOST =
  /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|metadata\.)/i;

export function assertSafeLaCheieUrl(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new PortalError("INVALID_REQUEST", "Adresa API La Cheie nu este un URL valid.");
  }
  const isDev = process.env["NODE_ENV"] !== "production";
  if (url.protocol !== "https:" && !(isDev && url.protocol === "http:")) {
    throw new PortalError("INVALID_REQUEST", "Adresa API La Cheie trebuie să folosească HTTPS.");
  }
  if (!isDev && PRIVATE_HOST.test(url.hostname)) {
    throw new PortalError("INVALID_REQUEST", "Adresa API La Cheie nu este publică.");
  }
  return url;
}

/* -------------------------------- request -------------------------------- */

export type LaCheieRequestInput = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  /** Text zecimal; se trimite identic la fiecare retry al aceleiași operații. */
  sourceVersion?: string | null;
  timeoutMs?: number;
};

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 500);
  }
}

export async function laCheieRequest(
  config: LaCheieRequestConfig,
  input: LaCheieRequestInput,
): Promise<LaCheieResponse> {
  const base = assertSafeLaCheieUrl(config.baseUrl);
  const url = new URL(`${base.pathname.replace(/\/+$/, "")}${input.path}`, base);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const isWrite = input.method !== "GET";
  if (isWrite && input.body !== undefined && exceedsLaCheieBodyLimit(input.body)) {
    throw new PortalError(
      "INVALID_REQUEST",
      "Corpul cererii depășește limita de 1 MiB acceptată de La Cheie.",
    );
  }
  const limited = isWrite
    ? hitCounter(writeCounters, config.connectionKey, LACHEIE_WRITE_LIMIT_PER_MINUTE)
    : hitCounter(readCounters, config.connectionKey, LACHEIE_READ_LIMIT_PER_MINUTE);
  if (limited) {
    throw new PortalError(
      "RATE_LIMIT",
      isWrite
        ? `S-a atins limita de ${LACHEIE_WRITE_LIMIT_PER_MINUTE} scrieri pe minut către La Cheie. Reia în scurt timp.`
        : `S-a atins limita de ${LACHEIE_READ_LIMIT_PER_MINUTE} citiri pe minut către La Cheie. Reia în scurt timp.`,
    );
  }

  const startedAt = Date.now();
  let attempt = 0;
  let last: LaCheieResponse | null = null;

  while (attempt < LACHEIE_MAX_ATTEMPTS) {
    attempt += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? REQUEST_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: "application/json",
      };
      if (isWrite) {
        headers["Content-Type"] = "application/json";
        if (input.sourceVersion) headers[LACHEIE_SOURCE_VERSION_HEADER] = input.sourceVersion;
      }
      const response = await fetch(url.toString(), {
        method: input.method,
        headers,
        ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
        signal: controller.signal,
      });
      const body = await readBody(response);
      const classification = classifyLaCheieStatus({
        status: response.status,
        attempt,
        retryAfter: response.headers.get("retry-after"),
      });
      last = {
        ok: classification.action === "ok",
        status: response.status,
        body,
        attempts: attempt,
        durationMs: Date.now() - startedAt,
        classification,
        ...(response.status === 409
          ? { conflict: { acceptedVersion: acceptedVersionFromConflict(body) } }
          : {}),
      };
      if (classification.action === "ok") return last;
      if (classification.action === "retry_same" || classification.action === "retry_after") {
        if (classification.waitMs > 0) await sleep(classification.waitMs);
        continue;
      }
      return last;
    } catch (error) {
      const timeout = error instanceof Error && error.name === "AbortError";
      const classification = classifyLaCheieNetworkError({ attempt, timeout });
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
      classification: classifyLaCheieNetworkError({ attempt, timeout: true }),
    }
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.min(ms, 30_000)));
}
