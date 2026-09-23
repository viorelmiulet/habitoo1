/**
 * Client HTTP PrimulAnunț.ro — API public v1, scris exclusiv după documentația
 * oficială: https://www.primulanunt.ro/api-agentii
 *
 * Reguli respectate strict:
 *  - un singur host permis: https://www.primulanunt.ro (fără redirecturi);
 *  - `Authorization: Bearer {api_key}` pe TOATE apelurile; cheia este statică,
 *    emisă din contul agenției („Integrare CRM”), nu se reînnoiește;
 *  - `Content-Type: application/json` doar când cererea are corp JSON;
 *  - timeout 10 secunde per apel;
 *  - cheia API nu ajunge niciodată în mesaje, detalii sau loguri.
 */
import type {
  PrimulAnuntCall,
  PrimulAnuntCallFail,
  PrimulAnuntFailKind,
  PrimulAnuntListing,
  PrimulAnuntListingDto,
  PrimulAnuntListingPatch,
  PrimulAnuntMediaFile,
  PrimulAnuntMediaItem,
  PrimulAnuntMediaUpload,
  PrimulAnuntPing,
} from "./types";

export const PRIMULANUNT_BASE_URL = "https://www.primulanunt.ro";
const PRIMULANUNT_ALLOWED_HOST = "www.primulanunt.ro";
const PRIMULANUNT_TIMEOUT_MS = 10_000;

export const PRIMULANUNT_MESSAGE = {
  invalidApiKey: "Cheie API PrimulAnunț.ro lipsă sau revocată.",
  notFound: "Anunțul nu a fost găsit pe PrimulAnunț.ro.",
  invalidData: "PrimulAnunț.ro a respins datele.",
  processingError: "Eroare de procesare la PrimulAnunț.ro.",
  serverError: "PrimulAnunț.ro a întâmpinat o eroare de server. Reîncearcă în câteva minute.",
  timeout: "PrimulAnunț.ro nu a răspuns în 10 secunde.",
  networkError: "PrimulAnunț.ro nu a putut fi contactat.",
  blockedHost: "Adresă PrimulAnunț.ro nepermisă: se acceptă doar www.primulanunt.ro.",
} as const;

/** Orice URL construit trece prin această verificare înainte de fetch. */
export function assertPrimulAnuntUrl(url: string): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== PRIMULANUNT_ALLOWED_HOST) {
    throw new Error("primulanunt_host_not_allowed");
  }
  return parsed;
}

function buildUrl(path: string): URL {
  return assertPrimulAnuntUrl(new URL(path, PRIMULANUNT_BASE_URL).toString());
}

function fail(
  kind: PrimulAnuntFailKind,
  status: number | null,
  body: unknown,
  extra?: { message?: string; fields?: string[] },
): PrimulAnuntCallFail {
  const fallback: Record<PrimulAnuntFailKind, string> = {
    invalid_api_key: PRIMULANUNT_MESSAGE.invalidApiKey,
    not_found: PRIMULANUNT_MESSAGE.notFound,
    invalid_data: PRIMULANUNT_MESSAGE.invalidData,
    processing_error: PRIMULANUNT_MESSAGE.processingError,
    server_error: PRIMULANUNT_MESSAGE.serverError,
    timeout: PRIMULANUNT_MESSAGE.timeout,
    network_error: PRIMULANUNT_MESSAGE.networkError,
    blocked_host: PRIMULANUNT_MESSAGE.blockedHost,
  };
  return {
    ok: false,
    kind,
    status,
    message: extra?.message ?? fallback[kind],
    body,
    ...(extra?.fields ? { fields: extra.fields } : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Lista câmpurilor invalide dintr-un răspuns 422. Documentația spune doar
 * „primești lista câmpurilor”, deci acceptăm formele uzuale: un array de nume,
 * un obiect `{ câmp: [mesaje] }` sau ambele sub `errors` / `fields`.
 */
export function invalidFieldsFrom(body: unknown): string[] {
  const root = asRecord(body);
  if (!root) return [];
  const candidates = [root["fields"], root["errors"], asRecord(root["error"])?.["fields"]];
  const out: string[] = [];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const entry of candidate) {
        if (typeof entry === "string") out.push(entry);
        else {
          const record = asRecord(entry);
          const name = record?.["field"] ?? record?.["name"];
          if (typeof name === "string") out.push(name);
        }
      }
    } else {
      const record = asRecord(candidate);
      if (record) out.push(...Object.keys(record));
    }
  }
  return [...new Set(out.filter((name) => name.trim().length > 0))];
}

/** Mesajul explicit în română pe care portalul îl trimite la 400. */
export function messageFrom(body: unknown): string | null {
  const root = asRecord(body);
  if (!root) return typeof body === "string" && body.trim() ? body.trim().slice(0, 300) : null;
  const direct = root["message"] ?? root["detail"] ?? root["error"];
  if (typeof direct === "string" && direct.trim()) return direct.trim().slice(0, 300);
  const nested = asRecord(direct)?.["message"];
  return typeof nested === "string" && nested.trim() ? nested.trim().slice(0, 300) : null;
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

function classify(status: number, body: unknown): PrimulAnuntCallFail {
  if (status === 401 || status === 403) return fail("invalid_api_key", status, body);
  if (status === 404) return fail("not_found", status, body);
  if (status === 422) {
    const fields = invalidFieldsFrom(body);
    const list = fields.length > 0 ? fields.join(", ") : (messageFrom(body) ?? "câmpuri invalide");
    return fail("invalid_data", status, body, {
      message: `PrimulAnunț.ro a respins datele: ${list}.`,
      fields,
    });
  }
  if (status === 400) {
    const detail = messageFrom(body);
    return fail("processing_error", status, body, {
      message: detail
        ? `Eroare de procesare la PrimulAnunț.ro: ${detail}`
        : PRIMULANUNT_MESSAGE.processingError,
    });
  }
  if (status >= 500) return fail("server_error", status, body);
  return fail("processing_error", status, body);
}

function networkFailure(error: unknown): PrimulAnuntCallFail {
  if (error instanceof Error) {
    if (error.message === "primulanunt_host_not_allowed") {
      return fail("blocked_host", null, null);
    }
    if (error.name === "AbortError" || /timed? ?out/i.test(error.message)) {
      return fail("timeout", null, null);
    }
  }
  return fail("network_error", null, null);
}

async function call<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  options: { apiKey: string; jsonBody?: unknown; parse: (body: unknown) => T },
): Promise<PrimulAnuntCall<T>> {
  let url: URL;
  try {
    url = buildUrl(path);
  } catch (error) {
    return networkFailure(error);
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.apiKey}`,
    Accept: "application/json",
  };
  if (options.jsonBody !== undefined) headers["Content-Type"] = "application/json";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PRIMULANUNT_TIMEOUT_MS);
  let response: Response;
  let body: unknown;
  try {
    response = await fetch(url.toString(), {
      method,
      headers,
      redirect: "manual",
      ...(options.jsonBody === undefined ? {} : { body: JSON.stringify(options.jsonBody) }),
      signal: controller.signal,
    });
    body = await readBody(response);
  } catch (error) {
    return networkFailure(error);
  } finally {
    clearTimeout(timer);
  }

  // Niciun redirect nu este urmat: ar putea ieși din allowlist.
  if (response.status >= 300 && response.status < 400) {
    return fail("blocked_host", response.status, body);
  }
  if (!response.ok) return classify(response.status, body);
  return { ok: true, status: response.status, data: options.parse(body) };
}

function parseListing(body: unknown): PrimulAnuntListing {
  const root = asRecord(body);
  if (!root) return {};
  const nested = asRecord(root["listing"]) ?? root;
  const pick = (key: string): string | null => {
    const value = nested[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const id = pick("id");
  const externalId = pick("external_id");
  const slug = pick("slug");
  const status = pick("status");
  const url = pick("url");
  const rejection = pick("rejection_reason");
  return {
    ...(id ? { id } : {}),
    ...(externalId ? { external_id: externalId } : {}),
    slug,
    status,
    url,
    rejection_reason: rejection,
  };
}

/** `GET /api/public/v1/ping` — verificarea cheii. Succes = 200. */
export function ping(apiKey: string): Promise<PrimulAnuntCall<PrimulAnuntPing>> {
  return call("GET", "/api/public/v1/ping", {
    apiKey,
    parse: (body) => (asRecord(body) as PrimulAnuntPing | null) ?? { ok: true },
  });
}

/**
 * `POST /api/public/v1/listings` — creare SAU actualizare: cu `external_id`
 * trimis, a doua cerere actualizează același anunț (upsert idempotent).
 */
export function createOrUpdateListing(
  apiKey: string,
  dto: PrimulAnuntListingDto,
): Promise<PrimulAnuntCall<PrimulAnuntListing>> {
  return call("POST", "/api/public/v1/listings", {
    apiKey,
    jsonBody: dto,
    parse: parseListing,
  });
}

/** `PATCH /api/public/v1/listings/{id}` — modifică DOAR câmpurile trimise. */
export function patchListing(
  apiKey: string,
  id: string,
  partial: PrimulAnuntListingPatch,
): Promise<PrimulAnuntCall<PrimulAnuntListing>> {
  return call("PATCH", `/api/public/v1/listings/${encodeURIComponent(id)}`, {
    apiKey,
    jsonBody: partial,
    parse: parseListing,
  });
}

/** `DELETE /api/public/v1/listings/{id}` — arhivează anunțul (nu îl șterge). */
export function deleteListing(
  apiKey: string,
  id: string,
): Promise<PrimulAnuntCall<PrimulAnuntListing>> {
  return call("DELETE", `/api/public/v1/listings/${encodeURIComponent(id)}`, {
    apiKey,
    parse: parseListing,
  });
}
