/**
 * Client HTTP Romimo API v2 — scris exclusiv după documentația oficială.
 *
 * Reguli respectate strict:
 *  - un singur host permis: https://services.romimo.ro (fără redirecturi);
 *  - `x-api-version: 2` pe TOATE apelurile;
 *  - tokenul se obține cu `POST /api/Token?ApiKey=…` și `Content-Length: 0`
 *    (fără body, altfel serverul răspunde 411); valabil 24 de ore;
 *  - apelurile autentificate folosesc `Authorization: Bearer {token}`;
 *  - timeout 10s per apel; 5xx/rețea: un singur retry la GET/DELETE, niciunul
 *    la POST (ca să nu dublăm anunțuri);
 *  - ApiKey-ul și tokenul nu ajung niciodată în loguri sau în mesaje.
 */
import { createHash } from "node:crypto";

import type {
  RomimoArticle,
  RomimoCall,
  RomimoCallFail,
  RomimoPackage,
  RomimoProblemDetails,
  SaveArticleDto,
} from "./types";

export const ROMIMO_BASE_URL = "https://services.romimo.ro";
const ROMIMO_ALLOWED_HOST = "services.romimo.ro";
export const ROMIMO_API_VERSION = "2";
const ROMIMO_TIMEOUT_MS = 10_000;
/** Sub cele 24h documentate, ca să nu folosim niciodată un token la limită. */
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

export const ROMIMO_MESSAGE = {
  invalidRequest:
    "Romimo a respins cererea: structură invalidă SAU emailul contului nu are pachet Romimo activ.",
  invalidApiKey: "ApiKey Romimo invalid.",
  tokenExpired: "Token Romimo expirat.",
  unsupportedMediaType: "Romimo a respins formatul cererii (Content-Type neacceptat).",
  serverError: "Romimo a returnat o eroare de server. Reîncearcă mai târziu.",
  timeout: "Romimo nu a răspuns în 10 secunde.",
  networkError: "Romimo nu a putut fi contactat.",
  notFound: "Romimo nu a găsit anunțul cerut.",
  blockedHost: "Adresă Romimo nepermisă: se acceptă doar services.romimo.ro.",
} as const;

/** Orice URL construit trece prin această verificare înainte de fetch. */
export function assertRomimoUrl(url: string): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== ROMIMO_ALLOWED_HOST) {
    throw new Error("romimo_host_not_allowed");
  }
  return parsed;
}

function buildUrl(path: string, query?: Record<string, string>): URL {
  const url = new URL(path, ROMIMO_BASE_URL);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  return assertRomimoUrl(url.toString());
}

function fail(
  kind: RomimoCallFail["kind"],
  status: number | null,
  body: unknown,
  message?: string,
): RomimoCallFail {
  const fallback: Record<RomimoCallFail["kind"], string> = {
    invalid_request: ROMIMO_MESSAGE.invalidRequest,
    invalid_api_key: ROMIMO_MESSAGE.invalidApiKey,
    token_expired: ROMIMO_MESSAGE.tokenExpired,
    unsupported_media_type: ROMIMO_MESSAGE.unsupportedMediaType,
    not_found: ROMIMO_MESSAGE.notFound,
    server_error: ROMIMO_MESSAGE.serverError,
    timeout: ROMIMO_MESSAGE.timeout,
    network_error: ROMIMO_MESSAGE.networkError,
    blocked_host: ROMIMO_MESSAGE.blockedHost,
  };
  return { ok: false, kind, status, message: message ?? fallback[kind], body };
}

/** Textul suplimentar din ProblemDetails, fără chei care pot purta secrete. */
function problemText(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const problem = body as RomimoProblemDetails;
  const parts = [problem.title, problem.detail].filter(
    (part): part is string => typeof part === "string" && part.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(" — ") : null;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

type RawAttempt = { response: Response; body: unknown };

async function sendOnce(url: URL, init: RequestInit): Promise<RawAttempt> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROMIMO_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      ...init,
      redirect: "manual",
      signal: controller.signal,
    });
    return { response, body: await readBody(response) };
  } finally {
    clearTimeout(timer);
  }
}

function classify(status: number, body: unknown): RomimoCallFail {
  if (status === 400) {
    const extra = problemText(body);
    return fail(
      "invalid_request",
      status,
      body,
      extra ? `${ROMIMO_MESSAGE.invalidRequest} ${extra}` : ROMIMO_MESSAGE.invalidRequest,
    );
  }
  if (status === 401 || status === 403) return fail("invalid_api_key", status, body);
  if (status === 402) return fail("token_expired", status, body);
  if (status === 404) return fail("not_found", status, body);
  if (status === 415) return fail("unsupported_media_type", status, body);
  if (status >= 500) return fail("server_error", status, body);
  return fail("invalid_request", status, body);
}

function networkFailure(error: unknown): RomimoCallFail {
  if (error instanceof Error) {
    if (error.message === "romimo_host_not_allowed") return fail("blocked_host", null, null);
    if (error.name === "AbortError" || /timed? ?out/i.test(error.message)) {
      return fail("timeout", null, null);
    }
  }
  return fail("network_error", null, null);
}

/**
 * Un apel Romimo complet: headerul de versiune, timeout, clasificarea erorilor
 * și (doar la GET/DELETE) o singură reîncercare la 5xx sau eroare de rețea.
 */
async function call<T>(
  method: "GET" | "POST" | "DELETE",
  url: URL,
  options: { token?: string; jsonBody?: unknown; emptyBody?: boolean; parse: (body: unknown) => T },
): Promise<RomimoCall<T>> {
  const headers: Record<string, string> = { "x-api-version": ROMIMO_API_VERSION, Accept: "*/*" };
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
  if (options.jsonBody !== undefined) headers["Content-Type"] = "application/json";
  // POST /api/Token nu are corp: fără Content-Length: 0 serverul răspunde 411.
  if (options.emptyBody) headers["Content-Length"] = "0";

  const init: RequestInit = {
    method,
    headers,
    ...(options.jsonBody !== undefined ? { body: JSON.stringify(options.jsonBody) } : {}),
  };
  const retryable = method !== "POST";

  for (let attempt = 0; attempt < (retryable ? 2 : 1); attempt += 1) {
    let raw: RawAttempt;
    try {
      raw = await sendOnce(url, init);
    } catch (error) {
      const failure = networkFailure(error);
      if (retryable && attempt === 0 && failure.kind !== "blocked_host") continue;
      return failure;
    }
    const { response, body } = raw;
    if (response.status >= 300 && response.status < 400) {
      // Niciun redirect nu este urmat: ar putea duce în afara allowlist-ului.
      return fail("blocked_host", response.status, body);
    }
    if (response.ok) return { ok: true, status: response.status, data: options.parse(body) };
    const failure = classify(response.status, body);
    if (retryable && attempt === 0 && failure.kind === "server_error") continue;
    return failure;
  }
  return fail("network_error", null, null);
}

/** `POST /api/Token?ApiKey=…` → JWT ca string (valabil 24h). */
export async function getToken(apiKey: string): Promise<RomimoCall<string>> {
  let url: URL;
  try {
    url = buildUrl("/api/Token", { ApiKey: apiKey });
  } catch (error) {
    return networkFailure(error);
  }
  const result = await call("POST", url, {
    emptyBody: true,
    parse: (body) => (typeof body === "string" ? body.replace(/^"|"$/g, "").trim() : ""),
  });
  if (!result.ok) return result;
  if (!result.data) return fail("invalid_api_key", result.status, null);
  return result;
}

/** `GET /api/User/Package?Email=` — pachetul contului agenției. */
export function getPackage(token: string, email: string): Promise<RomimoCall<RomimoPackage | null>> {
  let url: URL;
  try {
    url = buildUrl("/api/User/Package", { Email: email });
  } catch (error) {
    return Promise.resolve(networkFailure(error));
  }
  return call("GET", url, {
    token,
    parse: (body) => (body && typeof body === "object" ? (body as RomimoPackage) : null),
  });
}

/** `POST /api/Article` — creează sau actualizează anunțul (upsert pe externalid). */
export function saveArticle(token: string, dto: SaveArticleDto): Promise<RomimoCall<unknown>> {
  let url: URL;
  try {
    url = buildUrl("/api/Article");
  } catch (error) {
    return Promise.resolve(networkFailure(error));
  }
  return call("POST", url, { token, jsonBody: dto, parse: (body) => body });
}

/** `GET /api/Article?Email=&ExternalId=` */
export function getArticle(
  token: string,
  email: string,
  externalId: string,
): Promise<RomimoCall<RomimoArticle | null>> {
  let url: URL;
  try {
    url = buildUrl("/api/Article", { Email: email, ExternalId: externalId });
  } catch (error) {
    return Promise.resolve(networkFailure(error));
  }
  return call("GET", url, {
    token,
    parse: (body) => (body && typeof body === "object" ? (body as RomimoArticle) : null),
  });
}

/** `DELETE /api/Article?Email=&ExternalId=` — succes la 200 sau 204. */
export function deleteArticle(
  token: string,
  email: string,
  externalId: string,
): Promise<RomimoCall<unknown>> {
  let url: URL;
  try {
    url = buildUrl("/api/Article", { Email: email, ExternalId: externalId });
  } catch (error) {
    return Promise.resolve(networkFailure(error));
  }
  return call("DELETE", url, { token, parse: (body) => body });
}

/**
 * Cache de token în memorie, cheiat pe amprenta ApiKey-ului (niciodată pe
 * ApiKey-ul în clar) și expirat sub cele 24h documentate. Nu se persistă.
 */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

function cacheKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 32);
}

export function clearRomimoTokenCache(): void {
  tokenCache.clear();
}

export async function getCachedToken(apiKey: string): Promise<RomimoCall<string>> {
  const key = cacheKey(apiKey);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { ok: true, status: 200, data: cached.token };
  }
  const fresh = await getToken(apiKey);
  if (fresh.ok) tokenCache.set(key, { token: fresh.data, expiresAt: Date.now() + TOKEN_TTL_MS });
  return fresh;
}

/**
 * Rulează un apel autentificat: la 401 (token invalid) sau 402 (token expirat)
 * se obține un token nou O SINGURĂ dată și apelul se reia O SINGURĂ dată.
 */
export async function withRomimoToken<T>(
  apiKey: string,
  run: (token: string) => Promise<RomimoCall<T>>,
): Promise<RomimoCall<T>> {
  const first = await getCachedToken(apiKey);
  if (!first.ok) return first;

  const attempt = await run(first.data);
  if (attempt.ok) return attempt;
  if (attempt.kind !== "invalid_api_key" && attempt.kind !== "token_expired") return attempt;

  tokenCache.delete(cacheKey(apiKey));
  const renewed = await getToken(apiKey);
  if (!renewed.ok) return renewed;
  tokenCache.set(cacheKey(apiKey), { token: renewed.data, expiresAt: Date.now() + TOKEN_TTL_MS });
  return run(renewed.data);
}
