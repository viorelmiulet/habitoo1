/**
 * Client HTTP Vumsi Orion (https://vumsi.com/api/orion), doar pe server.
 *
 *  - `X-Api-Key` cu cheia de partener Habitoo (una pentru toate agențiile), JSON, timeout 30 s;
 *  - erorile vin ca `{ status: "error", code, data: { errors } }` → mesaj în română;
 *  - cel mult 2 cereri / secundă (global, în acest Worker);
 *  - 429: o pauză și o singură reîncercare; 401/403 nu se reîncearcă;
 *  - etapa 1: clientul acceptă DOAR GET (nicio scriere la Vumsi);
 *  - cheia nu apare în mesaje, detalii sau răspunsuri.
 */
import { VUMSI_BASE_URL, VUMSI_KEY_MISSING_MESSAGE, readVumsiKey } from "./config";

export const VUMSI_TIMEOUT_MS = 30_000;
export const VUMSI_MIN_INTERVAL_MS = 500; // 2 cereri / secundă
export const VUMSI_RATE_RETRY_MS = 2_000;
export const VUMSI_MAX_WAIT_MS = 30_000;
export const VUMSI_RAW_LIMIT = 20_000;
export const VUMSI_USER_AGENT = "Habitoo CRM (+https://habitoo.ro)";

export type VumsiFailKind =
  | "not_configured"
  | "validation"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "client_error"
  | "server_error"
  | "timeout"
  | "network_error"
  | "blocked_redirect";

export type VumsiCallFail = {
  ok: false;
  kind: VumsiFailKind;
  status: number | null;
  message: string;
  transient: boolean;
  /** Erorile pe câmp, când Vumsi le întoarce ca obiect. */
  fieldErrors?: Record<string, string>;
  retryAfterMs: number | null;
  body: unknown;
};
export type VumsiCallOk<T> = { ok: true; status: number; data: T };
export type VumsiCall<T> = VumsiCallOk<T> | VumsiCallFail;

const MESSAGE: Record<VumsiFailKind, string> = {
  not_configured: VUMSI_KEY_MISSING_MESSAGE,
  validation: "Vumsi a respins datele trimise.",
  unauthorized: "Cheia de partener Vumsi este invalidă sau lipsește.",
  forbidden: "Vumsi refuză operația (permisiuni insuficiente pentru contul de partener).",
  not_found: "Resursa nu există la Vumsi.",
  rate_limited: "S-a atins limita de cereri către Vumsi. Reîncearcă peste câteva momente.",
  client_error: "Vumsi a respins cererea.",
  server_error: "Vumsi a întâmpinat o eroare. Reîncearcă în câteva minute.",
  timeout: "Vumsi nu a răspuns în 30 de secunde.",
  network_error: "Vumsi nu a putut fi contactat.",
  blocked_redirect: "Vumsi a cerut o redirecționare, care nu este permisă.",
};
const TRANSIENT = new Set<VumsiFailKind>(["rate_limited", "server_error", "timeout", "network_error"]);

const rec = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function text(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join("; ") || null;
  const r = rec(v);
  if (r) return Object.entries(r).map(([k, x]) => `${k}: ${text(x) ?? ""}`).join("; ") || null;
  return null;
}

export function classifyVumsiStatus(status: number): VumsiFailKind {
  if (status === 400 || status === 422) return "validation";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  return "client_error";
}

export function truncateRaw(body: unknown): unknown {
  if (body === null || body === undefined) return null;
  const t = typeof body === "string" ? body : JSON.stringify(body);
  return t.length <= VUMSI_RAW_LIMIT ? body : `${t.slice(0, VUMSI_RAW_LIMIT)}… [trunchiat]`;
}

export function scrubKey(t: string, key: string | null): string {
  return key && key.length >= 4 ? t.split(key).join("[cheie ascunsă]") : t;
}

/** Eroarea Vumsi `{ status, code, data: { errors } }` → mesaj în română. */
export function vumsiFailure(httpStatus: number, body: unknown, retryAfterMs: number | null = null): VumsiCallFail {
  const b = rec(body) ?? {};
  const code = typeof b["code"] === "number" ? (b["code"] as number) : httpStatus;
  const kind = classifyVumsiStatus(code >= 400 ? code : httpStatus);
  const errors = rec(b["data"])?.["errors"] ?? b["detail"] ?? null;
  const fieldErrors: Record<string, string> = {};
  const er = rec(errors);
  if (er) for (const [k, v] of Object.entries(er)) { const t = text(v); if (t) fieldErrors[k] = t; }
  const details = text(errors);
  let message = MESSAGE[kind];
  if (details && kind !== "unauthorized") message = `${message} ${details}${/[.!?]$/.test(details) ? "" : "."}`;
  return {
    ok: false, kind, status: httpStatus, message, transient: TRANSIENT.has(kind),
    ...(Object.keys(fieldErrors).length ? { fieldErrors } : {}),
    retryAfterMs, body: truncateRaw(body),
  };
}

/** Răspunsurile reușite vin ca `{ status: "ok", code, data }`; întoarcem `data`. */
export function unwrapVumsi(body: unknown): unknown {
  const r = rec(body);
  return r && r["status"] === "ok" && "data" in r ? r["data"] : body;
}

function fail(kind: VumsiFailKind, status: number | null = null): VumsiCallFail {
  return { ok: false, kind, status, message: MESSAGE[kind], transient: TRANSIENT.has(kind), retryAfterMs: null, body: null };
}

// ------------------------------------------------------------ limitator 2/s
let lastAt = Number.NEGATIVE_INFINITY;
export function resetVumsiClientState() {
  lastAt = Number.NEGATIVE_INFINITY;
}
export function vumsiLimiterWaitMs(now: number): number {
  return Math.max(0, lastAt + VUMSI_MIN_INTERVAL_MS - now);
}

export type VumsiDeps = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
  env?: Record<string, string | undefined>;
};

/** GET către Orion. `path` relativ (ex. `/me/`), `query` opțional. */
export async function vumsiGet<T>(path: string, query: Record<string, string | number> = {}, deps: VumsiDeps = {}): Promise<VumsiCall<T>> {
  const env = deps.env ?? process.env;
  const key = readVumsiKey(env);
  if (!key) return fail("not_configured");
  const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
  const url = `${VUMSI_BASE_URL}${path.startsWith("/") ? path : `/${path}`}${qs ? `?${qs}` : ""}`;
  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const wait = vumsiLimiterWaitMs(now());
    if (wait > 0) await sleep(wait);
    lastAt = Math.max(now(), lastAt + VUMSI_MIN_INTERVAL_MS);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? VUMSI_TIMEOUT_MS);
    let response: Response;
    try {
      response = await doFetch(url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "X-Api-Key": key, Accept: "application/json", "User-Agent": VUMSI_USER_AGENT },
      });
    } catch (error) {
      clearTimeout(timer);
      return fail(error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error");
    }
    clearTimeout(timer);
    if (response.status >= 300 && response.status < 400) return fail("blocked_redirect", response.status);
    const raw = scrubKey(await response.text().catch(() => ""), key);
    let parsed: unknown = null;
    if (raw) {
      try { parsed = JSON.parse(raw); } catch { parsed = raw.slice(0, VUMSI_RAW_LIMIT); }
    }
    if (response.ok) return { ok: true, status: response.status, data: unwrapVumsi(parsed) as T };
    const retrySec = Number(response.headers.get("Retry-After"));
    const retryAfterMs = Number.isFinite(retrySec) && retrySec > 0 ? retrySec * 1000 : null;
    const failure = vumsiFailure(response.status, parsed, retryAfterMs);
    if (failure.kind !== "rate_limited" || attempt > 0) return failure;
    const pause = retryAfterMs ?? VUMSI_RATE_RETRY_MS;
    if (pause > VUMSI_MAX_WAIT_MS) return failure;
    await sleep(pause);
  }
  return fail("rate_limited");
}

export type VumsiMe = { company_name?: string; email?: string; status?: string; mode?: string; publish_behaviour?: string };

export function getVumsiMe(deps?: VumsiDeps) {
  return vumsiGet<VumsiMe>("/me/", {}, deps);
}

export function describeVumsiMe(me: VumsiMe | null | undefined): string {
  const m = me ?? {};
  return [
    `Vumsi conectat: ${m.company_name ?? m.email ?? "cont necunoscut"}`,
    `mod: ${m.mode ?? "necunoscut"}`,
    `publicare: ${m.publish_behaviour ?? "necunoscută"}`,
  ].join(" · ");
}
