/**
 * Client HTTP HomeDirect.ro — CRM API v1 (OpenAPI: https://www.homedirect.ro/api/docs/openapi.json).
 *
 *  - `X-API-Key` cu cheia CRM Habitoo (una pentru toate agențiile), JSON, timeout 30 s;
 *  - `redirect: "manual"`: un redirect nu se urmează (corpul unui POST nu se pierde în tăcere);
 *  - mesaje în română pentru 400/401/403/404/409/429; 409 întoarce `existing` pentru reconciliere;
 *  - 429: o pauză și o singură reîncercare; 401 nu se reîncearcă; 5xx/rețea = tranzitorii;
 *  - limitator global sub 10.000 de cereri / oră;
 *  - cheia nu apare în mesaje, detalii sau răspunsuri; corpul brut se păstrează trunchiat (~20 KB).
 */
import { HOMEDIRECT_KEY_MISSING_MESSAGE, readHomedirectKey, resolveHomedirectBaseUrl, type HomedirectEnvironment } from "./config";

export const HOMEDIRECT_TIMEOUT_MS = 30_000;
export const HOMEDIRECT_WINDOW_MS = 60 * 60_000;
/** Plafon local, cu marjă sub limita portalului de 10.000 / oră. */
export const HOMEDIRECT_WINDOW_LIMIT = 9_000;
export const HOMEDIRECT_RATE_RETRY_MS = 5_000;
export const HOMEDIRECT_MAX_WAIT_MS = 30_000;
export const HOMEDIRECT_RAW_LIMIT = 20_000;
export const HOMEDIRECT_USER_AGENT = "Habitoo CRM (+https://habitoo.ro)";

export type HomedirectFailKind =
  | "not_configured"
  | "invalid_base_url"
  | "validation"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "duplicate"
  | "rate_limited"
  | "client_error"
  | "server_error"
  | "timeout"
  | "network_error"
  | "blocked_redirect";

export type HomedirectCallFail = {
  ok: false;
  kind: HomedirectFailKind;
  status: number | null;
  message: string;
  /** Tranzitoriu: se poate reîncerca mai târziu (5xx, rețea, timeout, 429). */
  transient: boolean;
  field?: string | null;
  validValues?: string[];
  /** 409 DUPLICATE_EXTERNAL_ID: anunțul existent, pentru reconciliere. */
  existing?: { id: string | null; shortId: string | null } | null;
  retryAfterMs: number | null;
  /** Corpul brut (trunchiat), pentru jurnal. */
  body: unknown;
};
export type HomedirectCallOk<T> = { ok: true; status: number; data: T; environment: HomedirectEnvironment };
export type HomedirectCall<T> = HomedirectCallOk<T> | HomedirectCallFail;

const MESSAGE: Record<HomedirectFailKind, string> = {
  not_configured: HOMEDIRECT_KEY_MISSING_MESSAGE,
  invalid_base_url: "",
  validation: "HomeDirect a respins datele trimise.",
  unauthorized: "Cheia CRM HomeDirect este invalidă sau lipsește.",
  forbidden: "HomeDirect refuză operația (permisiuni insuficiente sau anunțul nu aparține acestui cont).",
  not_found: "Anunțul nu există la HomeDirect.",
  duplicate: "HomeDirect are deja un anunț cu acest cod extern.",
  rate_limited: "S-a atins limita de cereri către HomeDirect. Reîncearcă peste câteva minute.",
  client_error: "HomeDirect a respins cererea.",
  server_error: "HomeDirect a întâmpinat o eroare. Reîncearcă în câteva minute.",
  timeout: "HomeDirect nu a răspuns în 30 de secunde.",
  network_error: "HomeDirect nu a putut fi contactat.",
  blocked_redirect: "HomeDirect a cerut o redirecționare, care nu este permisă.",
};

const TRANSIENT = new Set<HomedirectFailKind>(["rate_limited", "server_error", "timeout", "network_error"]);

const rec = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);

function detailsText(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (Array.isArray(v)) return v.map(detailsText).filter(Boolean).join("; ") || null;
  const r = rec(v);
  if (r) return Object.entries(r).map(([k, x]) => `${k}: ${detailsText(x) ?? ""}`).join("; ") || null;
  return str(v);
}

export function classifyHomedirectStatus(status: number): HomedirectFailKind {
  if (status === 400) return "validation";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "duplicate";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  return "client_error";
}

/** Eroarea HomeDirect `{ error, details, field?, validValues?, existing? }` → mesaj în română. */
export function homedirectFailure(status: number, body: unknown, retryAfterMs: number | null = null): HomedirectCallFail {
  const kind = classifyHomedirectStatus(status);
  const b = rec(body) ?? {};
  const field = str(b["field"]);
  const validValues = Array.isArray(b["validValues"]) ? (b["validValues"] as unknown[]).map(str).filter((x): x is string => !!x) : [];
  const details = detailsText(b["details"]) ?? str(b["error"]);
  let message = MESSAGE[kind];
  if (kind === "validation") {
    const parts = [field ? `Câmp: ${field}.` : null, details ? `${details}${/[.!?]$/.test(details) ? "" : "."}` : null,
      validValues.length ? `Valori acceptate: ${validValues.slice(0, 30).join(", ")}.` : null].filter(Boolean);
    if (parts.length) message = `${message} ${parts.join(" ")}`;
  }
  const ex = rec(b["existing"]);
  const existing = kind === "duplicate" ? { id: str(ex?.["id"]), shortId: str(ex?.["shortId"]) } : null;
  if (existing && (existing.id || existing.shortId)) message = `${message} (anunț existent: ${existing.shortId ?? existing.id})`;
  return {
    ok: false, kind, status, message, transient: TRANSIENT.has(kind),
    ...(field ? { field } : {}),
    ...(validValues.length ? { validValues } : {}),
    ...(kind === "duplicate" ? { existing } : {}),
    retryAfterMs, body: truncateRaw(body),
  };
}

function fail(kind: HomedirectFailKind, message?: string, status: number | null = null): HomedirectCallFail {
  return { ok: false, kind, status, message: message ?? MESSAGE[kind], transient: TRANSIENT.has(kind), retryAfterMs: null, body: null };
}

/** Corpul brut pentru jurnal, trunchiat la ~20 KB. */
export function truncateRaw(body: unknown): unknown {
  if (body === null || body === undefined) return null;
  const text = typeof body === "string" ? body : JSON.stringify(body);
  if (text.length <= HOMEDIRECT_RAW_LIMIT) return body;
  return `${text.slice(0, HOMEDIRECT_RAW_LIMIT)}… [trunchiat]`;
}

/** Șterge orice apariție a cheii dintr-un text (apărare suplimentară). */
export function scrubKey(text: string, key: string | null): string {
  return key && key.length >= 4 ? text.split(key).join("[cheie ascunsă]") : text;
}

// ------------------------------------------------------------ limitator global
let stamps: number[] = [];
export function resetHomedirectClientState() {
  stamps = [];
}
export function homedirectLimiterWaitMs(now: number): number {
  stamps = stamps.filter((t) => now - t < HOMEDIRECT_WINDOW_MS);
  if (stamps.length < HOMEDIRECT_WINDOW_LIMIT) return 0;
  return HOMEDIRECT_WINDOW_MS - (now - stamps[0]!);
}

export type HomedirectDeps = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
  env?: Record<string, string | undefined>;
};

export async function homedirectRequest<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  deps: HomedirectDeps = {},
): Promise<HomedirectCall<T>> {
  const env = deps.env ?? process.env;
  const key = readHomedirectKey(env);
  if (!key) return fail("not_configured");
  const base = resolveHomedirectBaseUrl(env["HOMEDIRECT_API_BASE_URL"]);
  if (!base.ok) return fail("invalid_base_url", base.message);
  const url = `${base.url}${path.startsWith("/") ? path : `/${path}`}`;
  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const wait = homedirectLimiterWaitMs(now());
    if (wait > HOMEDIRECT_MAX_WAIT_MS) return { ...fail("rate_limited"), retryAfterMs: wait };
    if (wait > 0) await sleep(wait);
    stamps.push(now());

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? HOMEDIRECT_TIMEOUT_MS);
    let response: Response;
    try {
      response = await doFetch(url, {
        method,
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "X-API-Key": key,
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": HOMEDIRECT_USER_AGENT,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      clearTimeout(timer);
      return fail(error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error");
    }
    clearTimeout(timer);
    if (response.status >= 300 && response.status < 400) return fail("blocked_redirect", undefined, response.status);
    const text = scrubKey(await response.text().catch(() => ""), key);
    let parsed: unknown = null;
    if (text) {
      try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, HOMEDIRECT_RAW_LIMIT); }
    }
    if (response.ok) return { ok: true, status: response.status, data: parsed as T, environment: base.environment };
    const retrySec = Number(response.headers.get("Retry-After"));
    const retryAfterMs = Number.isFinite(retrySec) && retrySec > 0 ? retrySec * 1000 : null;
    const failure = homedirectFailure(response.status, parsed, retryAfterMs);
    if (failure.kind !== "rate_limited" || attempt > 0) return failure;
    const pause = retryAfterMs ?? HOMEDIRECT_RATE_RETRY_MS;
    if (pause > HOMEDIRECT_MAX_WAIT_MS) return failure;
    await sleep(pause);
  }
  return fail("rate_limited");
}

/** `GET /stats`: limita pe oră, cererile rămase și ora resetării. */
export function getHomedirectStats(deps?: HomedirectDeps) {
  return homedirectRequest<unknown>("GET", "/stats", undefined, deps);
}

export function describeHomedirectStats(body: unknown, environment: HomedirectEnvironment): string {
  const root = rec(rec(body)?.["stats"]) ?? rec(rec(body)?.["data"]) ?? rec(body) ?? {};
  const rl = rec(root["rateLimit"]) ?? {};
  const limit = str(rl["limit"]) ?? str(root["rateLimit"]) ?? str(root["limit"]);
  const remaining = str(rl["remaining"]) ?? str(root["remainingRequests"]) ?? str(root["remaining"]);
  const reset = str(rl["reset"]) ?? str(rl["resetAt"]) ?? str(root["resetTime"]) ?? str(root["reset"]) ?? str(root["resetAt"]);
  let resetText = reset;
  if (reset) {
    const n = Number(reset);
    const d = Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n) : new Date(reset);
    if (!Number.isNaN(d.getTime())) resetText = d.toLocaleTimeString("ro-RO", { timeZone: "Europe/Bucharest", hour: "2-digit", minute: "2-digit" });
  }
  return [
    `HomeDirect conectat (${environment === "production" ? "Producție" : "Dezvoltare"})`,
    `limită pe oră: ${limit ?? "necunoscută"}`,
    `cereri rămase: ${remaining ?? "necunoscut"}`,
    `resetare: ${resetText ?? "necunoscută"}`,
  ].join(" · ");
}
