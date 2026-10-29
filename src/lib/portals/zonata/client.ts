/**
 * Client HTTP ZonaTa — API v1 (https://zonata.ro/api), scris după documentația
 * publică: JSON UTF-8, `Authorization: Bearer zt_live_…|zt_test_…`.
 *
 * Reguli:
 *  - doar HTTPS pe zonata.ro, redirecturile nu se urmează;
 *  - POST /listings: 90 s; celelalte cereri: 30 s; cheia nu ajunge în loguri;
 *  - mesaje în română pentru 401/402/403/404/422/429 (la 422 cu câmpurile din `details`);
 *  - 429: o pauză și o singură reîncercare;
 *  - limitator local pe cheie, sub limita portalului (300 cereri / 10 minute).
 */
import { isValidZonataKey, normalizeZonataKey } from "./key";

export const ZONATA_BASE_URL = "https://zonata.ro/api/v1";
const ZONATA_HOST = "zonata.ro";
export const ZONATA_TIMEOUT_MS = 30_000;
export const ZONATA_LISTING_POST_TIMEOUT_MS = 90_000;
export const ZONATA_WINDOW_MS = 10 * 60_000;
/** Plafon local, sub cele 300 de cereri / 10 minute ale portalului. */
export const ZONATA_WINDOW_LIMIT = 280;
/** Pauza implicită înainte de unica reîncercare la 429. */
export const ZONATA_RATE_RETRY_MS = 5_000;
/** Peste această pauză nu mai așteptăm în aceeași cerere. */
export const ZONATA_MAX_WAIT_MS = 30_000;

export const ZONATA_ENTERPRISE_MESSAGE =
  "Cheia live funcționează doar cu pachetul Enterprise ZonaTa al agenției (650 lei / 30 de zile, plătit de agenție direct la ZonaTa). Până atunci, cu o cheie zt_test_ se poate verifica tot fluxul, fără să se salveze nimic.";

export type ZonataFailKind =
  | "invalid_key_format"
  | "unauthorized"
  | "package_required"
  | "email_unverified"
  | "not_found"
  | "validation"
  | "rate_limited"
  | "client_error"
  | "server_error"
  | "timeout"
  | "network_error"
  | "blocked_redirect";

export type ZonataFieldError = { field: string; message: string };

export type ZonataCallFail = {
  ok: false;
  kind: ZonataFailKind;
  status: number | null;
  code: string | null;
  message: string;
  fields?: ZonataFieldError[];
  retryAfterMs: number | null;
  body: unknown;
};

export type ZonataCallOk<T> = { ok: true; status: number; data: T };
export type ZonataCall<T> = ZonataCallOk<T> | ZonataCallFail;

const KIND_MESSAGE: Record<ZonataFailKind, string> = {
  invalid_key_format: "Cheia ZonaTa nu are formatul corect (zt_live_… sau zt_test_…).",
  unauthorized: "Cheia ZonaTa lipsește, nu este validă sau a fost revocată. Agenția poate crea una nouă în contul ZonaTa (Contul meu → API).",
  package_required: `Contul ZonaTa al agenției nu are pachetul necesar pentru API. ${ZONATA_ENTERPRISE_MESSAGE}`,
  email_unverified: "Emailul contului ZonaTa al agenției nu este confirmat. Agenția trebuie să-l confirme din contul ZonaTa.",
  not_found: "Anunțul nu există în contul ZonaTa al agenției.",
  validation: "ZonaTa a respins datele trimise.",
  rate_limited: "S-a atins limita de cereri către ZonaTa (300 la 10 minute). Reîncearcă peste câteva minute.",
  client_error: "ZonaTa a respins cererea.",
  server_error: "ZonaTa a întâmpinat o eroare. Reîncearcă în câteva minute.",
  timeout: "ZonaTa nu a răspuns în 30 de secunde.",
  network_error: "ZonaTa nu a putut fi contactat.",
  blocked_redirect: "ZonaTa a cerut o redirecționare, care nu este permisă.",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;
}

/** `details` la 422: listă `{field, message}` sau obiect `{câmp: mesaj | [mesaje]}`. */
export function zonataFieldErrors(body: unknown): ZonataFieldError[] {
  const details = asRecord(body)?.["details"];
  if (Array.isArray(details)) {
    return details.flatMap((d) => {
      const r = asRecord(d);
      if (!r) return typeof d === "string" ? [{ field: "", message: d }] : [];
      return [{ field: str(r["field"]) ?? "", message: str(r["message"]) ?? str(r["error"]) ?? "" }];
    });
  }
  const obj = asRecord(details);
  if (!obj) return [];
  return Object.entries(obj).map(([field, v]) => ({
    field,
    message: Array.isArray(v) ? v.map(str).filter(Boolean).join(", ") : (str(v) ?? ""),
  }));
}

export function classifyZonataError(status: number, code: string | null): ZonataFailKind {
  switch (code) {
    case "unauthorized": return "unauthorized";
    case "package_required": return "package_required";
    case "email_unverified": return "email_unverified";
    case "not_found": return "not_found";
    case "validation_error": return "validation";
    case "rate_limited": return "rate_limited";
  }
  if (status === 401) return "unauthorized";
  if (status === 402) return "package_required";
  if (status === 403) return "email_unverified";
  if (status === 404) return "not_found";
  if (status === 422) return "validation";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  return "client_error";
}

export function zonataErrorMessage(kind: ZonataFailKind, fields: ZonataFieldError[] = []): string {
  const base = KIND_MESSAGE[kind];
  if (kind !== "validation" || fields.length === 0) return base;
  const list = fields
    .slice(0, 15)
    .map((f) => (f.field && f.message ? `${f.field}: ${f.message}` : f.field || f.message))
    .join("; ");
  return `${base} Câmpuri: ${list}.`;
}

// ---------------------------------------------------------------------------
// Limitator local pe cheie (fereastră glisantă, în memoria workerului).
// ---------------------------------------------------------------------------
const windows = new Map<string, number[]>();

/** Doar pentru teste. */
export function resetZonataClientState() {
  windows.clear();
}

/** Câte ms trebuie așteptat până la un loc liber în fereastră (0 = imediat). */
export function zonataLimiterWaitMs(key: string, now: number): number {
  const list = (windows.get(key) ?? []).filter((t) => now - t < ZONATA_WINDOW_MS);
  windows.set(key, list);
  if (list.length < ZONATA_WINDOW_LIMIT) return 0;
  return ZONATA_WINDOW_MS - (now - list[0]!);
}

function recordRequest(key: string, now: number) {
  const list = windows.get(key) ?? [];
  list.push(now);
  windows.set(key, list);
}

export type ZonataDeps = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function fail(kind: ZonataFailKind, extra: Partial<Omit<ZonataCallFail, "ok" | "kind">> = {}): ZonataCallFail {
  return {
    ok: false,
    kind,
    status: extra.status ?? null,
    code: extra.code ?? null,
    message: extra.message ?? zonataErrorMessage(kind, extra.fields),
    ...(extra.fields && extra.fields.length > 0 ? { fields: extra.fields } : {}),
    retryAfterMs: extra.retryAfterMs ?? null,
    body: extra.body ?? null,
  };
}

function buildUrl(path: string): string {
  const url = new URL(`${ZONATA_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`);
  if (url.protocol !== "https:" || url.hostname !== ZONATA_HOST) throw new Error("zonata_host_not_allowed");
  return url.toString();
}

export async function zonataRequest<T>(
  apiKey: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  deps: ZonataDeps = {},
): Promise<ZonataCall<T>> {
  const key = normalizeZonataKey(apiKey);
  if (!isValidZonataKey(key)) return fail("invalid_key_format");
  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? (method === "POST" && path.replace(/\/$/, "") === "/listings" ? ZONATA_LISTING_POST_TIMEOUT_MS : ZONATA_TIMEOUT_MS);
  const url = buildUrl(path);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const wait = zonataLimiterWaitMs(key, now());
    if (wait > ZONATA_MAX_WAIT_MS) return fail("rate_limited", { retryAfterMs: wait });
    if (wait > 0) await sleep(wait);
    recordRequest(key, now());

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    let text: string;
    try {
      response = await doFetch(url, {
        method,
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json; charset=utf-8" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      // Include body download in the deadline: headers alone are not a complete response.
      text = await response.text();
    } catch (error) {
      clearTimeout(timer);
      const timedOut = controller.signal.aborted || (error instanceof Error && error.name === "AbortError");
      return fail(timedOut ? "timeout" : "network_error", timedOut ? { message: `ZonaTa nu a răspuns în ${timeoutMs / 1000} de secunde.` } : {});
    }
    clearTimeout(timer);

    if (response.status >= 300 && response.status < 400) {
      return fail("blocked_redirect", { status: response.status });
    }
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text.slice(0, 2000);
      }
    }
    if (response.ok) return { ok: true, status: response.status, data: parsed as T };

    const errField = asRecord(parsed)?.["error"];
    const code = typeof errField === "string" ? errField : str(asRecord(errField)?.["code"]);
    const kind = classifyZonataError(response.status, code);
    const fields = zonataFieldErrors(parsed);
    const retryAfterSec = Number(response.headers.get("Retry-After"));
    const retryAfterMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : null;
    const result = fail(kind, { status: response.status, code, fields, retryAfterMs, body: parsed });
    if (kind !== "rate_limited" || attempt > 0) return result;
    const pause = retryAfterMs ?? ZONATA_RATE_RETRY_MS;
    if (pause > ZONATA_MAX_WAIT_MS) return result;
    await sleep(pause);
  }
  return fail("rate_limited");
}

/** `GET /me`: contul, pachetul, modul cheii și limitele. */
export function getZonataAccount(apiKey: string, deps?: ZonataDeps) {
  return zonataRequest<unknown>(apiKey, "GET", "/me", undefined, deps);
}

function formatLimits(v: unknown): string | null {
  const r = asRecord(v);
  if (!r) return str(v);
  const parts = Object.entries(r)
    .map(([k, val]) => (str(val) ? `${k}: ${str(val)}` : null))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** Rezumatul afișat la „Testează conexiunea”, tolerant la forma răspunsului `/me`. */
export function describeZonataAccount(body: unknown, keyMode: "live" | "test" | null): string {
  const root = asRecord(asRecord(body)?.["data"]) ?? asRecord(body) ?? {};
  const account = asRecord(root["account"]) ?? asRecord(root["user"]) ?? root;
  const name = str(account["name"]) ?? str(account["company"]) ?? str(account["email"]) ?? "cont necunoscut";
  const pkgRaw = root["package"] ?? root["plan"] ?? account["package"];
  const pkg = asRecord(pkgRaw);
  const pkgName = pkg ? (str(pkg["name"]) ?? str(pkg["slug"]) ?? str(pkg["type"])) : str(pkgRaw);
  const pkgUntil = pkg ? (str(pkg["expires_at"]) ?? str(pkg["valid_until"])) : null;
  const keyRec = asRecord(root["key"]);
  const mode = str(root["mode"]) ?? str(keyRec?.["mode"]) ?? keyMode;
  const limits = formatLimits(root["limits"] ?? root["rate_limit"]);
  return [
    `Cont ZonaTa: ${name}`,
    `pachet: ${pkgName ?? "fără pachet"}${pkgUntil ? ` (până la ${pkgUntil})` : ""}`,
    `mod cheie: ${mode === "test" ? "Test" : mode === "live" ? "Live" : "necunoscut"}`,
    ...(limits ? [`limite: ${limits}`] : []),
  ].join(" · ");
}
