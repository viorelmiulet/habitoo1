/** Client Vrexa Partner API v1: OAuth client_credentials, JSON, doar HTTPS. */
import { VREXA_TIMEOUT_MS, type VrexaEnv } from "./config";

export type VrexaTransport = (url: string, init: RequestInit) => Promise<Response>;
export type VrexaCredentials = { organizationId: string; env: VrexaEnv; baseUrl: string; clientId: string; clientSecret: string };
export type VrexaProblem = { code: string | null; detail: string | null; errors: Record<string, string[]> | null };
export type VrexaResult<T = unknown> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number | null; kind: "auth" | "agency_inactive" | "rate_limited" | "validation" | "not_found" | "http" | "network" | "config"; message: string; problem: VrexaProblem; retryAt?: string; retryAfterMs?: number };

export const VREXA_TOKEN_TTL_MS = 25 * 60_000;
export const VREXA_MAX_RETRY_AFTER_S = 10;
export const VREXA_BAD_CREDENTIALS = "Vrexa a refuzat datele de acces. Verifică client id și client secret generate în Vrexa (Configurare agenție → Integrare API).";
export const VREXA_AGENCY_INACTIVE = "Agenția nu este activă pe Vrexa.";

const tokens = new Map<string, { token: string; expiresAt: number }>();
export function clearVrexaTokenCache(): void { tokens.clear(); }

type Deps = { transport?: VrexaTransport; now?: () => number; sleep?: (ms: number) => Promise<void> };

/** Elimină din text orice valoare secretă cunoscută. */
export function redactVrexa(text: string, secrets: (string | null | undefined)[]): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 4) out = out.split(s).join("[redactat]");
  return out.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redactat]");
}

function assertHttps(url: string): void {
  if (new URL(url).protocol !== "https:") throw new Error("Vrexa acceptă doar HTTPS.");
}

async function readProblem(res: Response, secrets: string[]): Promise<{ body: unknown; problem: VrexaProblem }> {
  const text = await res.text().catch(() => "");
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const errors = b["errors"] && typeof b["errors"] === "object" ? (b["errors"] as Record<string, string[]>) : null;
  const detail = typeof b["detail"] === "string" ? redactVrexa(b["detail"], secrets) : typeof b["title"] === "string" ? redactVrexa(b["title"], secrets) : null;
  return { body, problem: { code: typeof b["code"] === "string" ? b["code"] : null, detail, errors } };
}

function fail(status: number | null, problem: VrexaProblem, fallback: string, retryAt?: string, retryAfterMs?: number): VrexaResult<never> {
  const code = problem.code;
  if (code === "agency_inactive") return { ok: false, status, kind: "agency_inactive", message: VREXA_AGENCY_INACTIVE, problem };
  if (status === 401 || code === "invalid_client" || code === "unauthorized") return { ok: false, status, kind: "auth", message: VREXA_BAD_CREDENTIALS, problem };
  if (status === 429 || code === "rate_limited" || code === "daily_limit_reached" || code === "daily_reply_limit_reached")
    return { ok: false, status, kind: "rate_limited", message: retryAt ? `Vrexa a limitat cererile; se poate relua după ${retryAt}.` : `Vrexa a limitat cererile${problem.detail ? `: ${problem.detail}` : "."}`, problem, ...(retryAt ? { retryAt } : {}), ...(retryAfterMs ? { retryAfterMs } : {}) };
  if (code === "validation_failed") {
    const fields = problem.errors ? Object.entries(problem.errors).map(([k, v]) => `${k}: ${(Array.isArray(v) ? v : [v]).join(", ")}`).join("; ") : "";
    return { ok: false, status, kind: "validation", message: `Vrexa a respins datele${fields ? `: ${fields}` : problem.detail ? `: ${problem.detail}` : "."}`, problem };
  }
  if (code === "type_mismatch") return { ok: false, status, kind: "http", message: problem.detail ? `Vrexa: ${problem.detail}` : "Vrexa: tipul anunțului diferă de cel existent.", problem };
  if (code === "not_found" || status === 404) return { ok: false, status, kind: "not_found", message: problem.detail ?? "Vrexa: resursa nu există.", problem };
  return { ok: false, status, kind: "http", message: problem.detail ? `Vrexa: ${problem.detail}` : fallback, problem };
}

const empty: VrexaProblem = { code: null, detail: null, errors: null };

async function requestToken(c: VrexaCredentials, d: Required<Deps>): Promise<VrexaResult<string>> {
  const url = `${c.baseUrl}/oauth/token`;
  assertHttps(url);
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: c.clientId, client_secret: c.clientSecret }).toString();
  let res: Response;
  try {
    res = await d.transport(url, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body, signal: AbortSignal.timeout(VREXA_TIMEOUT_MS) });
  } catch {
    return { ok: false, status: null, kind: "network", message: "Vrexa nu a răspuns la cererea de autentificare.", problem: empty };
  }
  if (res.status >= 300 && res.status < 400) return { ok: false, status: res.status, kind: "http", message: "Vrexa a răspuns cu o redirecționare neașteptată.", problem: empty };
  const { body: json, problem } = await readProblem(res, [c.clientSecret]);
  if (!res.ok) {
    if (res.status === 400 || res.status === 401) return { ok: false, status: res.status, kind: problem.code === "agency_inactive" ? "agency_inactive" : "auth", message: problem.code === "agency_inactive" ? VREXA_AGENCY_INACTIVE : VREXA_BAD_CREDENTIALS, problem };
    return fail(res.status, problem, `Vrexa a răspuns cu HTTP ${res.status} la autentificare.`);
  }
  const token = json && typeof json === "object" ? (json as Record<string, unknown>)["access_token"] : null;
  if (typeof token !== "string" || !token) return { ok: false, status: res.status, kind: "auth", message: "Vrexa nu a întors un token de acces.", problem: empty };
  tokens.set(`${c.organizationId}|${c.env}`, { token, expiresAt: d.now() + VREXA_TOKEN_TTL_MS });
  return { ok: true, status: res.status, data: token };
}

async function getToken(c: VrexaCredentials, d: Required<Deps>, fresh: boolean): Promise<VrexaResult<string>> {
  const key = `${c.organizationId}|${c.env}`;
  const hit = tokens.get(key);
  if (!fresh && hit && hit.expiresAt > d.now()) return { ok: true, status: 200, data: hit.token };
  tokens.delete(key);
  return requestToken(c, d);
}

/** Apel autentificat: token nou o singură dată la 401; o singură reîncercare la 429 (Retry-After ≤ 10 s). */
export async function vrexaRequest<T = unknown>(c: VrexaCredentials, method: "GET" | "POST" | "PUT" | "DELETE", path: string, payload?: unknown, deps: Deps = {}): Promise<VrexaResult<T>> {
  const d: Required<Deps> = { transport: deps.transport ?? fetch, now: deps.now ?? Date.now, sleep: deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))) };
  const url = `${c.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  assertHttps(url);
  let refreshed = false, retried429 = false;
  for (;;) {
    const t = await getToken(c, d, false);
    if (!t.ok) return t;
    let res: Response;
    try {
      res = await d.transport(url, {
        method, redirect: "manual", signal: AbortSignal.timeout(VREXA_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${t.data}`, Accept: "application/json", ...(payload !== undefined ? { "Content-Type": "application/json" } : {}) },
        ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
      });
    } catch {
      return { ok: false, status: null, kind: "network", message: "Vrexa nu a răspuns.", problem: empty };
    }
    if (res.status >= 300 && res.status < 400) return { ok: false, status: res.status, kind: "http", message: "Vrexa a răspuns cu o redirecționare neașteptată.", problem: empty };
    if (res.status === 401 && !refreshed) {
      refreshed = true;
      tokens.delete(`${c.organizationId}|${c.env}`);
      await res.body?.cancel().catch(() => undefined);
      continue;
    }
    if (res.status === 429) {
      const ra = Number(res.headers.get("Retry-After"));
      const seconds = Number.isFinite(ra) && ra >= 0 ? ra : VREXA_MAX_RETRY_AFTER_S + 1;
      if (!retried429 && seconds <= VREXA_MAX_RETRY_AFTER_S) {
        retried429 = true;
        await res.body?.cancel().catch(() => undefined);
        await d.sleep(seconds * 1000);
        continue;
      }
      const { problem } = await readProblem(res, [c.clientSecret, t.data]);
      const at = new Date(d.now() + seconds * 1000).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bucharest" });
      return fail(429, { ...problem, code: problem.code ?? "rate_limited" }, "Vrexa a limitat cererile.", at, seconds * 1000);
    }
    const { body, problem } = await readProblem(res, [c.clientSecret, t.data]);
    if (!res.ok) return fail(res.status, problem, `Vrexa a răspuns cu HTTP ${res.status}.`);
    return { ok: true, status: res.status, data: body as T };
  }
}
