/**
 * Client HTTP Housera (server-only). Fără loguri cu cheia; erorile poartă
 * doar coduri și nume de câmpuri, niciodată textul complet al portalului.
 */
import { HOUSERA_ANTIBOT_MESSAGE, HOUSERA_RECONNECT_MESSAGE, HOUSERA_TIMEOUT_MS, HOUSERA_USER_AGENT } from "./config";

export type HouseraErrorKind = "unauthorized" | "validation" | "busy" | "rate_limited" | "temporary" | "refused";

export class HouseraError extends Error {
  constructor(
    public kind: HouseraErrorKind,
    message: string,
    public status: number | null,
    public code: string | null = null,
    public codes: string[] = [],
    public fields: string[] = [],
    /** Doar la `409 duplicate_listing`: anunțul existent (cod public + ref). */
    public existing: { code: string; external_ref: string | null } | null = null,
  ) {
    super(message);
    this.name = "HouseraError";
  }
  /** Doar la 429: secundele din `Retry-After`. */
  retryAfterMs: number | null = null;
}

export type HouseraClientDeps = {
  key: string;
  baseUrl: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  /** Apelat la 401: marchează conexiunea „reconectare necesară”. */
  onUnauthorized?: () => Promise<void> | void;
};

export type HouseraRequest = { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; query?: Record<string, string | number>; body?: unknown; headers?: Record<string, string>; noRateRetry?: boolean };
export type HouseraResponse<T> = { status: number; headers: Headers; data: T };

const BUSY_RETRIES = 3;
const BUSY_DELAY_MS = 1_500;
const MAX_RETRY_AFTER_S = 60;
const LOW_REMAINING = 10;

/** Ritm per cheie (300/minut): ultimul `X-RateLimit-Remaining` văzut. */
const remainingByKey = new Map<string, number>();

export function retryAfterMs(header: string | null): number {
  const n = Number(header);
  const s = Number.isFinite(n) && n >= 0 ? n : 1;
  return Math.min(s, MAX_RETRY_AFTER_S) * 1000;
}

/** Pauză preventivă când rămân puține cereri în fereastra de un minut. */
export function throttleDelayMs(remaining: number | undefined): number {
  if (remaining === undefined || remaining >= LOW_REMAINING) return 0;
  return remaining <= 0 ? 60_000 / 300 * 10 : 60_000 / 300;
}

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try { return (await res.json()) as Record<string, unknown>; } catch { return null; }
}

function validationError(body: Record<string, unknown> | null): HouseraError {
  const list = Array.isArray(body?.["errors"]) ? (body!["errors"] as Array<Record<string, unknown>>) : [];
  const codes = [...new Set(list.map((e) => (typeof e["code"] === "string" ? e["code"] : null)).filter((v): v is string => !!v))];
  const fields = [...new Set(list.map((e) => (typeof e["pointer"] === "string" ? e["pointer"].replace(/^\/+/, "") : null)).filter((v): v is string => !!v))];
  const summary = fields.length ? `Date respinse de Housera: ${fields.join(", ")}` : "Date respinse de Housera.";
  return new HouseraError("validation", summary, 422, "validation", codes, fields);
}

export function createHouseraClient(deps: HouseraClientDeps) {
  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const timeoutMs = deps.timeoutMs ?? HOUSERA_TIMEOUT_MS;
  const rateKey = deps.key.split("|")[0] ?? "";

  async function once(path: string, req: HouseraRequest): Promise<Response> {
    const wait = throttleDelayMs(remainingByKey.get(rateKey));
    if (wait) await sleep(wait);
    const url = new URL(path.replace(/^\/+/, ""), deps.baseUrl);
    for (const [k, v] of Object.entries(req.query ?? {})) url.searchParams.set(k, String(v));
    const headers: Record<string, string> = { Authorization: `Bearer ${deps.key}`, Accept: "application/json", "User-Agent": HOUSERA_USER_AGENT };
    if (req.body !== undefined) headers["Content-Type"] = "application/json";
    for (const [k, v] of Object.entries(req.headers ?? {})) if (k.toLowerCase() !== "authorization" && k.toLowerCase() !== "user-agent") headers[k] = v;
    try {
      const res = await doFetch(url.toString(), {
        method: req.method ?? "GET",
        headers,
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
      const rem = res.headers.get("X-RateLimit-Remaining");
      if (rem !== null && Number.isFinite(Number(rem))) remainingByKey.set(rateKey, Number(rem));
      return res;
    } catch {
      throw new HouseraError("temporary", "Housera nu a răspuns la timp. Încearcă din nou mai târziu.", null, "timeout");
    }
  }

  async function request<T = unknown>(path: string, req: HouseraRequest = {}): Promise<T> {
    return (await requestMeta<T>(path, req)).data;
  }

  async function requestMeta<T = unknown>(path: string, req: HouseraRequest = {}): Promise<HouseraResponse<T>> {
    let rateRetried = false;
    let busyRetries = 0;
    for (;;) {
      const res = await once(path, req);
      if (res.status >= 200 && res.status < 300) {
        return { status: res.status, headers: res.headers, data: (res.status === 204 ? null : await readJson(res)) as T };
      }
      if (res.status >= 300 && res.status < 400) {
        throw new HouseraError("temporary", "Housera a răspuns cu o redirecționare neașteptată.", res.status, "redirect");
      }
      const body = await readJson(res);
      // 403 fără JSON = pagina de protecție anti-bot: temporar, se reia.
      if (res.status === 403 && !body) throw new HouseraError("temporary", HOUSERA_ANTIBOT_MESSAGE, 403, "antibot");
      const code = typeof body?.["code"] === "string" ? (body["code"] as string) : null;
      if (res.status === 401) {
        await deps.onUnauthorized?.();
        throw new HouseraError("unauthorized", HOUSERA_RECONNECT_MESSAGE, 401, code);
      }
      if (res.status === 429) {
        if (!rateRetried && !req.noRateRetry) { rateRetried = true; await sleep(retryAfterMs(res.headers.get("Retry-After"))); continue; }
        const err = new HouseraError("rate_limited", "Limita de cereri Housera a fost atinsă. Reîncearcă peste un minut.", 429, code ?? "too_many_requests");
        err.retryAfterMs = retryAfterMs(res.headers.get("Retry-After"));
        throw err;
      }
      if (res.status === 409 && code === "listing_busy") {
        if (busyRetries < BUSY_RETRIES) { busyRetries++; await sleep(BUSY_DELAY_MS); continue; }
        throw new HouseraError("busy", "Anunțul este modificat chiar acum pe Housera. Reîncearcă în câteva secunde.", 409, code);
      }
      if (res.status === 422) throw validationError(body);
      if (res.status >= 500) throw new HouseraError("temporary", "Housera este temporar indisponibil. Încearcă din nou mai târziu.", res.status, code);
      if (res.status === 409 && code === "duplicate_listing") {
        const ex = body?.["existing"] as Record<string, unknown> | undefined;
        const existing = ex && typeof ex["code"] === "string" ? { code: ex["code"] as string, external_ref: typeof ex["external_ref"] === "string" ? (ex["external_ref"] as string) : null } : null;
        throw new HouseraError("refused", `Ai deja un anunț Housera pentru această proprietate${existing ? ` (cod ${existing.code}${existing.external_ref ? `, ref ${existing.external_ref}` : ""})` : ""}. Nu s-a creat un duplicat.`, 409, code, [], [], existing);
      }
      throw new HouseraError("refused", `Housera a refuzat cererea (${res.status}${code ? ` ${code}` : ""}).`, res.status, code);
    }
  }

  return { request, requestMeta };
}

/** Doar pentru teste. */
export function resetHouseraRateState() { remainingByKey.clear(); }
