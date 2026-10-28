/**
 * Client HTTP imo24.ro — API de publicare v1.0.1, scris după specificația
 * OpenAPI oficială (https://imo24.ro/api/v1).
 *
 * Reguli respectate:
 *  - doar HTTPS pe imo24.ro: un redirect de pe HTTP schimbă POST în GET, deci
 *    redirecturile nu se urmează (`redirect: "manual"`);
 *  - `Authorization: Bearer i24_<prefix>_<secret>`; cheia nu ajunge în mesaje,
 *    detalii sau loguri;
 *  - JSON, timeout 60 s (publicarea e sincronă; imaginile au 50 s pe server);
 *  - citește `X-RateLimit-Remaining`/`X-RateLimit-Reset` și `X-Request-Id`;
 *    limita implicită este 600 cereri/oră pe cheie, iar clientul încetinește
 *    când rămân puține și nu mai trimite nimic când nu mai rămâne niciuna;
 *  - 401 nu se reîncearcă niciodată (60 de 401/oră blochează IP-ul) și cheia
 *    respinsă nu mai este folosită o vreme;
 *  - reîncercare cu pauză doar la 429 și 5xx (și erori de rețea).
 *
 * Endpointurile `/credite` nu sunt folosite deloc.
 */
import { isValidImo24Key, normalizeImo24Key } from "./key";

export const IMO24_BASE_URL = "https://imo24.ro/api/v1";
const IMO24_HOST = "imo24.ro";
export const IMO24_TIMEOUT_MS = 60_000;
export const IMO24_HOURLY_LIMIT = 600;
/** Sub acest număr de cereri rămase, clientul distanțează cererile. */
export const IMO24_SLOWDOWN_THRESHOLD = 50;
/** Pauza maximă de încetinire între două cereri. */
const IMO24_MAX_SPACING_MS = 10_000;
/** Reîncercări după prima încercare, doar pentru 429/5xx/rețea. */
export const IMO24_MAX_RETRIES = 2;
const IMO24_RETRY_BASE_MS = 2_000;
/** Peste această pauză cerută de portal nu mai așteptăm în aceeași cerere. */
const IMO24_MAX_RETRY_WAIT_MS = 30_000;
/** Cât timp nu mai folosim o cheie respinsă cu 401. */
export const IMO24_AUTH_COOLDOWN_MS = 15 * 60_000;

export type Imo24FailKind =
  | "invalid_key_format"
  | "unauthorized"
  | "auth_cooldown"
  | "forbidden_scope"
  | "rate_limited"
  | "package_limit"
  | "package_inactive"
  | "duplicate"
  | "immutable_field"
  | "validation"
  | "not_found"
  | "client_error"
  | "server_error"
  | "timeout"
  | "network_error"
  | "blocked_redirect";

export type Imo24FieldError = { field: string; code: string; message: string };

export type Imo24CallFail = {
  ok: false;
  kind: Imo24FailKind;
  status: number | null;
  /** `error.code` exact din răspuns, când există. */
  code: string | null;
  message: string;
  fields?: Imo24FieldError[];
  requestId: string | null;
  rateLimitRemaining: number | null;
  retryAfterMs: number | null;
  body: unknown;
};

export type Imo24CallOk<T> = {
  ok: true;
  status: number;
  data: T;
  requestId: string | null;
  rateLimitRemaining: number | null;
};

export type Imo24Call<T> = Imo24CallOk<T> | Imo24CallFail;

export type Imo24PackageState = "fara" | "activ" | "gratie" | "suspendat";

export type Imo24Account = {
  agentie: { id: number; nume: string; email: string };
  pachet: {
    stare: Imo24PackageState;
    total: number;
    ocupate: number;
    rezervate: number;
    libere: number;
    fara_limita: 0 | 1;
    expira: string;
    gratie_expira: string;
  };
  limite: Record<string, unknown> & { rata_ora?: number };
  cheie: { prefix: string; nume: string; scopuri: Array<"citire" | "scriere"> };
};

export const IMO24_PACKAGE_LABEL: Record<Imo24PackageState, string> = {
  fara: "fără pachet",
  activ: "activ",
  gratie: "în perioada de grație",
  suspendat: "suspendat",
};

const ERROR_MESSAGE: Partial<Record<string, string>> = {
  neautorizat: "Cheia imo24.ro lipsește, nu este validă sau a fost revocată. Generează una nouă din panoul agenției imo24.ro.",
  scop_insuficient: "Cheia imo24.ro nu are dreptul necesar. Generează o cheie cu scopul „scriere”.",
  cont_blocat: "Contul agenției este blocat pe imo24.ro.",
  limita_pachet: "Pachetul imo24.ro nu mai are sloturi libere. Eliberează un anunț sau mărește pachetul din contul imo24.ro.",
  pachet_inactiv: "Pachetul imo24.ro al agenției nu este activ. Activează sau reînnoiește pachetul din contul imo24.ro.",
  anunt_duplicat: "imo24.ro a găsit deja un anunț activ cu același titlu sau aceeași descriere în contul agenției. Modifică titlul sau descrierea.",
  external_id_existent: "Există deja un anunț imo24.ro cu același identificator Habitoo.",
  camp_imutabil: "imo24.ro nu permite modificarea unui câmp după publicare.",
  validare: "imo24.ro a respins datele anunțului.",
  anunt_negasit: "Anunțul nu a fost găsit pe imo24.ro.",
  rata_depasita: "S-a atins limita de cereri către imo24.ro. Reîncearcă peste câteva minute.",
  eroare_interna: "imo24.ro a întâmpinat o eroare. Reîncearcă în câteva minute.",
  serviciu_indisponibil: "imo24.ro este temporar indisponibil. Reîncearcă în câteva minute.",
};

const KIND_MESSAGE: Record<Imo24FailKind, string> = {
  invalid_key_format: "Cheia imo24.ro nu are formatul corect (i24_<8 hex>_<40 hex>).",
  unauthorized: ERROR_MESSAGE.neautorizat!,
  auth_cooldown:
    "Cheia imo24.ro a fost respinsă recent. Salvează o cheie nouă sau reîncearcă peste 15 minute.",
  forbidden_scope: ERROR_MESSAGE.scop_insuficient!,
  rate_limited: ERROR_MESSAGE.rata_depasita!,
  package_limit: ERROR_MESSAGE.limita_pachet!,
  package_inactive: ERROR_MESSAGE.pachet_inactiv!,
  duplicate: ERROR_MESSAGE.anunt_duplicat!,
  immutable_field: ERROR_MESSAGE.camp_imutabil!,
  validation: ERROR_MESSAGE.validare!,
  not_found: "Resursa nu a fost găsită pe imo24.ro.",
  client_error: "imo24.ro a respins cererea.",
  server_error: ERROR_MESSAGE.eroare_interna!,
  timeout: "imo24.ro nu a răspuns în 60 de secunde.",
  network_error: "imo24.ro nu a putut fi contactat.",
  blocked_redirect: "imo24.ro a cerut o redirecționare, care nu este permisă.",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function intHeader(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function fieldErrorsFrom(body: unknown): Imo24FieldError[] {
  const fields = asRecord(asRecord(asRecord(body)?.["error"])?.["fields"]);
  if (!fields) return [];
  return Object.entries(fields).map(([field, value]) => {
    const rec = asRecord(value);
    return {
      field,
      code: typeof rec?.["code"] === "string" ? (rec["code"] as string) : "",
      message: typeof rec?.["message"] === "string" ? (rec["message"] as string) : "",
    };
  });
}

/** Clasificarea unui răspuns de eroare după `error.code` și statusul HTTP. */
export function classifyImo24Error(status: number, code: string | null): Imo24FailKind {
  switch (code) {
    case "neautorizat":
    case "cont_blocat":
      return "unauthorized";
    case "scop_insuficient":
      return "forbidden_scope";
    case "rata_depasita":
      return "rate_limited";
    case "limita_pachet":
      return "package_limit";
    case "pachet_inactiv":
      return "package_inactive";
    case "anunt_duplicat":
    case "external_id_existent":
      return "duplicate";
    case "camp_imutabil":
      return "immutable_field";
    case "validare":
      return "validation";
    case "anunt_negasit":
    case "imagine_negasita":
    case "ruta_negasita":
      return "not_found";
  }
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden_scope";
  if (status === 429) return "rate_limited";
  if (status === 404) return "not_found";
  if (status === 422) return "validation";
  if (status >= 500) return "server_error";
  return "client_error";
}

/** Mesajul în română pentru agent; la validare include câmpurile respinse. */
export function imo24ErrorMessage(
  kind: Imo24FailKind,
  code: string | null,
  fields: Imo24FieldError[] = [],
): string {
  const base = (code && ERROR_MESSAGE[code]) || KIND_MESSAGE[kind];
  if (kind !== "validation" || fields.length === 0) return base;
  const list = fields
    .slice(0, 10)
    .map((f) => (f.message ? `${f.field}: ${f.message}` : f.field))
    .join("; ");
  return `${base} Câmpuri: ${list}.`;
}

export function isRetryableImo24Status(status: number): boolean {
  return status === 429 || status >= 500;
}

// ---------------------------------------------------------------------------
// Starea locală a limitei, per cheie (în memoria workerului, niciodată logată).
// ---------------------------------------------------------------------------

type KeyState = { remaining: number | null; resetAt: number | null; authFailedAt: number | null };
const keyStates = new Map<string, KeyState>();

function stateOf(key: string): KeyState {
  let s = keyStates.get(key);
  if (!s) {
    s = { remaining: null, resetAt: null, authFailedAt: null };
    keyStates.set(key, s);
  }
  return s;
}

/** Doar pentru teste. */
export function resetImo24ClientState() {
  keyStates.clear();
}

/**
 * Pauza dinaintea următoarei cereri: 0 cât timp rămân destule cereri; sub prag,
 * timpul rămas până la reset împărțit egal la cererile rămase (max 10 s).
 * `null` = nu mai rămâne nicio cerere până la reset.
 */
export function imo24SpacingMs(
  remaining: number | null,
  resetAt: number | null,
  now: number,
): number | null {
  if (remaining === null) return 0;
  if (resetAt !== null && resetAt <= now) return 0;
  if (remaining <= 0) return null;
  if (remaining >= IMO24_SLOWDOWN_THRESHOLD) return 0;
  const windowMs = resetAt !== null ? resetAt - now : 60 * 60_000;
  return Math.min(IMO24_MAX_SPACING_MS, Math.ceil(windowMs / remaining));
}

export type Imo24Deps = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function fail(
  kind: Imo24FailKind,
  extra: Partial<Omit<Imo24CallFail, "ok" | "kind">> = {},
): Imo24CallFail {
  return {
    ok: false,
    kind,
    status: extra.status ?? null,
    code: extra.code ?? null,
    message: extra.message ?? imo24ErrorMessage(kind, extra.code ?? null, extra.fields),
    ...(extra.fields && extra.fields.length > 0 ? { fields: extra.fields } : {}),
    requestId: extra.requestId ?? null,
    rateLimitRemaining: extra.rateLimitRemaining ?? null,
    retryAfterMs: extra.retryAfterMs ?? null,
    body: extra.body ?? null,
  };
}

function buildUrl(path: string): URL {
  const url = new URL(`${IMO24_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`);
  if (url.protocol !== "https:" || url.hostname !== IMO24_HOST) {
    throw new Error("imo24_host_not_allowed");
  }
  return url;
}

export async function imo24Request<T>(
  apiKey: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  deps: Imo24Deps = {},
): Promise<Imo24Call<T>> {
  const key = normalizeImo24Key(apiKey);
  if (!isValidImo24Key(key)) return fail("invalid_key_format");
  if (/^\/?credite\b|\/credite(\/|$)/.test(path)) throw new Error("imo24_credits_not_allowed");

  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? IMO24_TIMEOUT_MS;
  const state = stateOf(key);

  if (state.authFailedAt !== null && now() - state.authFailedAt < IMO24_AUTH_COOLDOWN_MS) {
    return fail("auth_cooldown", { status: 401, code: "neautorizat" });
  }

  const url = buildUrl(path);
  let last: Imo24CallFail | null = null;

  for (let attempt = 0; attempt <= IMO24_MAX_RETRIES; attempt += 1) {
    const spacing = imo24SpacingMs(state.remaining, state.resetAt, now());
    if (spacing === null) {
      const wait = state.resetAt !== null ? Math.max(0, state.resetAt - now()) : null;
      return fail("rate_limited", { rateLimitRemaining: 0, retryAfterMs: wait });
    }
    if (spacing > 0) await sleep(spacing);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await doFetch(url.toString(), {
        method,
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      clearTimeout(timer);
      const aborted = error instanceof Error && error.name === "AbortError";
      // Un timeout la o cerere sincronă de scriere poate fi deja aplicat: nu se reîncearcă.
      if (aborted) return fail("timeout");
      last = fail("network_error");
      if (attempt < IMO24_MAX_RETRIES) {
        await sleep(IMO24_RETRY_BASE_MS * 2 ** attempt);
        continue;
      }
      return last;
    }
    clearTimeout(timer);

    const requestId = response.headers.get("X-Request-Id");
    const remaining = intHeader(response.headers, "X-RateLimit-Remaining");
    const reset = intHeader(response.headers, "X-RateLimit-Reset");
    if (remaining !== null) state.remaining = remaining;
    else if (state.remaining !== null) state.remaining = Math.max(0, state.remaining - 1);
    if (reset !== null) state.resetAt = reset * 1000;

    if (response.status >= 300 && response.status < 400) {
      return fail("blocked_redirect", { status: response.status, requestId, rateLimitRemaining: remaining });
    }

    let parsed: unknown = null;
    const text = await response.text().catch(() => "");
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text.slice(0, 2000);
      }
    }

    if (response.ok) {
      state.authFailedAt = null;
      const data = (asRecord(parsed)?.["data"] ?? null) as T;
      return { ok: true, status: response.status, data, requestId, rateLimitRemaining: remaining };
    }

    const code = (() => {
      const c = asRecord(asRecord(parsed)?.["error"])?.["code"];
      return typeof c === "string" ? c : null;
    })();
    const kind = classifyImo24Error(response.status, code);
    const fields = fieldErrorsFrom(parsed);
    const retryAfterSec = intHeader(response.headers, "Retry-After");
    const retryAfterMs = retryAfterSec !== null ? retryAfterSec * 1000 : null;
    last = fail(kind, {
      status: response.status,
      code,
      fields,
      requestId,
      rateLimitRemaining: remaining,
      retryAfterMs,
      body: parsed,
    });

    if (response.status === 401) {
      state.authFailedAt = now();
      return last;
    }
    if (!isRetryableImo24Status(response.status) || attempt >= IMO24_MAX_RETRIES) return last;
    const wait = retryAfterMs ?? IMO24_RETRY_BASE_MS * 2 ** attempt;
    if (wait > IMO24_MAX_RETRY_WAIT_MS) return last;
    await sleep(wait);
  }
  return last ?? fail("network_error");
}

/** `GET /me`: agenția, pachetul și scopurile cheii. */
export function getImo24Account(apiKey: string, deps?: Imo24Deps) {
  return imo24Request<Imo24Account>(apiKey, "GET", "/me", undefined, deps);
}

/** Rezumatul afișat la „Testează conexiunea”. */
export function describeImo24Account(account: Imo24Account): {
  ok: boolean;
  summary: string;
} {
  const pachet = account.pachet;
  const stare = IMO24_PACKAGE_LABEL[pachet.stare] ?? pachet.stare;
  const sloturi = pachet.fara_limita === 1 ? "fără limită de sloturi" : `${pachet.libere}/${pachet.total} sloturi libere`;
  const scopuri = account.cheie.scopuri ?? [];
  const canWrite = scopuri.includes("scriere");
  const summary = [
    `Agenție: ${account.agentie.nume}`,
    `Pachet: ${stare}, ${sloturi}`,
    `Scopurile cheii: ${scopuri.length > 0 ? scopuri.join(", ") : "niciunul"}`,
    canWrite ? null : "Cheia nu are scopul „scriere”: generează o cheie cu scriere ca să poți publica.",
  ]
    .filter(Boolean)
    .join(" · ");
  return { ok: canWrite, summary };
}
