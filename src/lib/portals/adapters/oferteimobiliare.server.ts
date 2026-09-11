/**
 * Adaptor OferteImobiliare.ro — REST cu POST, portal „Powered by ImmoFlux”.
 *
 * Contract documentat public (https://oferteimobiliare.ro/integrare):
 *   GET  {base}/counties | /cities | /zones   nomenclatoare de locații
 *   POST {base}/properties                    listarea proprietăților agenției
 *   POST {base}/property                      adăugarea / actualizarea unei proprietăți
 *
 * Autentificare: `Authorization: Basic idagentie:parola`. Documentația arată
 * valoarea BRUTĂ, neobișnuit pentru „Basic”, deci trimitem întâi base64 standard
 * și, doar la 401, reluăm exact în forma din documentație. Credențialul nu se
 * loghează niciodată.
 *
 * Limitare reală: documentația NU are endpoint de ștergere sau retragere, deci
 * `withdrawListing` întoarce `NOT_SUPPORTED` cu explicație — nu inventăm o rută.
 */
import {
  notSupported,
  type ConnectionStatusOutcome,
  type ListingDiagnostics,
  type ListingOutcome,
  type ListingRef,
  type PortalAdapter,
  type PortalContext,
  type PortalResult,
} from "../adapter";
import { PORTAL_ERROR_MESSAGE, codeFromHttpStatus, toPortalError } from "../errors";
import type { PortalErrorCode } from "../errors";
import type { OiListing } from "../oferteimobiliare/mapper";
import { ensureOiGeoCache, type OiGeoCache } from "../oferteimobiliare/geo.server";

const DEFAULT_BASE_URL = "https://admin.imoro.ro/api/v1";
/** SSRF guard: nu contactăm niciodată un host nedeclarat. */
const ALLOWED_HOSTS = new Set(["admin.imoro.ro", "oferteimobiliare.ro", "www.oferteimobiliare.ro"]);
const TIMEOUT_MS = 15_000;

function baseUrlOf(ctx: PortalContext): string {
  const raw =
    typeof ctx.settings["endpoint_url"] === "string" ? String(ctx.settings["endpoint_url"]) : "";
  return (raw.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function endpoint(ctx: PortalContext, path: string): URL {
  const url = new URL(`${baseUrlOf(ctx)}${path}`);
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
    throw Object.assign(new Error("blocked_host"), { portalCode: "CONFIG_ERROR" as const });
  }
  return url;
}

/**
 * Credențialul agenției este salvat ca `idagentie:parola` (sau ca JSON cu cele
 * două câmpuri, dacă a fost completat din formularul de conexiune).
 */
function credentialPair(ctx: PortalContext): string | null {
  const raw = (ctx.portalCredential ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const id = parsed["agency_id"] ?? parsed["id"] ?? parsed["username"];
      const password = parsed["password"] ?? parsed["parola"];
      if (typeof id === "string" && typeof password === "string") return `${id}:${password}`;
    } catch {
      return null;
    }
    return null;
  }
  return raw.includes(":") ? raw : null;
}

function configured(ctx: PortalContext): boolean {
  return credentialPair(ctx) !== null;
}

type AuthMode = "base64" | "raw";

type ApiResponse = {
  status: number;
  body: Record<string, unknown> | null;
  list: unknown;
  raw: string;
  authMode: AuthMode;
};

function authHeader(pair: string, mode: AuthMode): string {
  return mode === "base64" ? `Basic ${btoa(pair)}` : `Basic ${pair}`;
}

async function call(
  ctx: PortalContext,
  method: "GET" | "POST",
  path: string,
  payload: unknown,
  mode: AuthMode,
): Promise<ApiResponse> {
  const url = endpoint(ctx, path);
  const pair = credentialPair(ctx) ?? "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers: {
        authorization: authHeader(pair, mode),
        accept: "application/json",
        ...(payload === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  let raw = "";
  try {
    raw = (await response.text()).slice(0, 2000);
  } catch {
    raw = "";
  }
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    parsed = null;
  }
  return {
    status: response.status,
    body:
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null,
    list: parsed,
    raw,
    authMode: mode,
  };
}

/**
 * Un request autentificat: base64 standard, iar la 401 exact varianta brută din
 * documentația portalului. Modul care a funcționat se raportează în `detail`.
 */
async function request(
  ctx: PortalContext,
  method: "GET" | "POST",
  path: string,
  payload?: unknown,
): Promise<ApiResponse> {
  const first = await call(ctx, method, path, payload, "base64");
  if (first.status !== 401 && first.status !== 403) return first;
  const second = await call(ctx, method, path, payload, "raw");
  return second.status === 401 || second.status === 403 ? first : second;
}

function failure(
  res: ApiResponse,
  operation: string,
): { code: PortalErrorCode; message: string; detail: string } {
  const code = codeFromHttpStatus(res.status);
  const compact = res.raw.replace(/\s+/g, " ").trim().slice(0, 300);

  if (res.status === 401 || res.status === 403) {
    return {
      code: "AUTH_ERROR",
      message:
        "OferteImobiliare a refuzat credențialele (nici codificate, nici în forma brută din documentație). Verifică id-ul agenției și parola.",
      detail: `${operation} http_${res.status}`,
    };
  }
  if (res.status === 422 || res.status === 400) {
    const errors = res.body?.["errors"] ?? res.body?.["error"] ?? res.body?.["message"];
    let fields = "";
    if (errors && typeof errors === "object") {
      fields = Object.entries(errors as Record<string, unknown>)
        .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
        .join(" • ")
        .slice(0, 400);
    } else if (typeof errors === "string") {
      fields = errors.slice(0, 400);
    }
    return {
      code: "VALIDATION_ERROR",
      message: `OferteImobiliare a respins datele anunțului. ${fields || compact}`.trim(),
      detail: `${operation} http_${res.status} ${fields || compact}`.trim(),
    };
  }
  return {
    code,
    message: `${PORTAL_ERROR_MESSAGE[code]} Răspuns portal: HTTP ${res.status}${compact ? ` — ${compact}` : ""}`,
    detail: `${operation} http_${res.status} ${compact}`.trim(),
  };
}

function configError(operation: string): PortalResult<never> {
  return {
    ok: false,
    code: "CONFIG_ERROR",
    message:
      "Credențialele OferteImobiliare (id agenție și parolă) nu sunt salvate pentru această agenție. Le primește agenția direct de la portal.",
    detail: operation,
  };
}

function fromThrown(error: unknown, operation: string): PortalResult<never> {
  if ((error as { portalCode?: string }).portalCode === "CONFIG_ERROR") {
    return {
      ok: false,
      code: "CONFIG_ERROR",
      message: "Adresa API OferteImobiliare nu este permisă.",
      detail: `${operation} blocked_host`,
    };
  }
  const normalized = toPortalError(error);
  return {
    ok: false,
    code: normalized.code,
    message: normalized.message,
    detail: normalized.detail,
  };
}

/** Nomenclatoarele de locații, cu cache; se descarcă doar când lipsesc/expiră. */
async function geoFor(ctx: PortalContext): Promise<OiGeoCache | null> {
  if (!ctx.allowLiveRequests) {
    const { readOiGeoCache } = await import("../oferteimobiliare/geo.server");
    return readOiGeoCache();
  }
  return ensureOiGeoCache(
    async (path) => {
      const res = await request(ctx, "GET", path);
      if (res.status !== 200) throw new Error(`http_${res.status}`);
      return res.list;
    },
    { organizationId: ctx.organizationId },
  );
}

async function payloadFor(ctx: PortalContext, ref: ListingRef) {
  const { buildOiPayload } = await import("../oferteimobiliare/payload.server");
  const geo = await geoFor(ctx);
  return buildOiPayload({ organizationId: ctx.organizationId, propertyId: ref.propertyId, geo });
}

function readEcho(res: ApiResponse): { id: string | null; url: string | null } {
  const node = (res.body?.["property"] ?? res.body?.["data"] ?? res.body) as Record<
    string,
    unknown
  > | null;
  const value = (key: string) => {
    const raw = node?.[key];
    return typeof raw === "string" || typeof raw === "number" ? String(raw) : null;
  };
  return { id: value("id") ?? value("property_id"), url: value("url") ?? value("link") };
}

type PushMode = "publish" | "update";

async function push(
  ctx: PortalContext,
  ref: ListingRef,
  mode: PushMode,
): Promise<PortalResult<ListingOutcome>> {
  if (!configured(ctx)) return configError(mode);

  const build = await payloadFor(ctx, ref);
  if (!build.ok) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: `Oferta nu poate fi trimisă la OferteImobiliare: ${build.reasons.join(" ")}`,
      detail: `${mode} not_eligible`,
    };
  }

  const ids = build.listings.map((l) => l.id).join(",");

  if (!ctx.allowLiveRequests) {
    return {
      ok: true,
      data: {
        externalId: ids,
        live: false,
        processed: build.listings.length,
        detail: `dry_run ${mode} listings=${build.listings.length}`,
        message:
          `Verificat local: ${build.listings.length} anunț(uri) valide, ` +
          `${build.listings[0]?.public_images.length ?? 0} imagini.` +
          (build.warnings.length ? ` ${build.warnings.join(" ")}` : ""),
      },
    };
  }

  const accepted: string[] = [];
  const urls: string[] = [];
  let authMode: AuthMode = "base64";
  try {
    for (const listing of build.listings as OiListing[]) {
      // Același `id` la a doua trimitere = actualizare (upsert) la portal.
      const res = await request(ctx, "POST", "/property", listing);
      if (res.status !== 200 && res.status !== 201) {
        const f = failure(res, mode);
        return { ok: false, code: f.code, message: f.message, detail: f.detail };
      }
      authMode = res.authMode;
      const echo = readEcho(res);
      accepted.push(echo.id ?? listing.id);
      if (echo.url) urls.push(echo.url);
    }
  } catch (error) {
    return fromThrown(error, mode);
  }

  return {
    ok: true,
    data: {
      externalId: accepted.join(","),
      live: true,
      processed: build.listings.length,
      publicUrl: urls[0] ?? null,
      detail: `${mode} ok listings=${build.listings.length} auth=${authMode}`,
      message:
        `OferteImobiliare a acceptat ${build.listings.length} anunț(uri).` +
        (urls.length ? ` Link: ${urls.join(" ")}` : "") +
        (build.warnings.length ? ` ${build.warnings.join(" ")}` : ""),
    },
  };
}

/** `POST /properties` este cel mai simplu apel autentificat care confirmă contul. */
async function status(
  ctx: PortalContext,
  live: boolean,
): Promise<PortalResult<ConnectionStatusOutcome>> {
  if (!configured(ctx)) {
    return {
      ok: true,
      data: {
        configured: false,
        live: false,
        detail: "Id-ul agenției și parola OferteImobiliare lipsesc.",
      },
    };
  }

  if (!live || !ctx.allowLiveRequests) {
    return {
      ok: true,
      data: {
        configured: true,
        live: false,
        detail: ctx.allowLiveRequests
          ? "Credențiale salvate; testează conexiunea pentru confirmare."
          : "Credențiale salvate; requesturile live sunt dezactivate pentru această agenție.",
      },
    };
  }

  try {
    const res = await request(ctx, "GET", "/counties");
    if (res.status !== 200) {
      const f = failure(res, "test_connection");
      return { ok: false, code: f.code, message: f.message, detail: f.detail };
    }
    const geo = await geoFor(ctx);
    const authNote =
      res.authMode === "base64" ? "Basic codificat" : "Basic brut (ca în documentație)";
    return {
      ok: true,
      data: {
        configured: true,
        live: true,
        detail:
          `Credențiale valide (${authNote}). Nomenclatoare: ` +
          `${geo?.counties.length ?? 0} județe, ${geo?.cities.length ?? 0} orașe, ${geo?.zones.length ?? 0} zone.`,
      },
    };
  } catch (error) {
    return fromThrown(error, "test_connection");
  }
}

export const oferteImobiliareAdapter: PortalAdapter = {
  id: "oferteimobiliare",

  async testConnection(ctx) {
    return status(ctx, true);
  },

  async getStatus(ctx) {
    return status(ctx, false);
  },

  async publishListing(ctx, ref) {
    return push(ctx, ref, "publish");
  },

  async updateListing(ctx, ref) {
    return push(ctx, ref, "update");
  },

  /**
   * API-ul portalului nu documentează ștergere sau retragere. Retragerea se
   * face din contul agenției pe OferteImobiliare; nu o simulăm aici.
   */
  async withdrawListing() {
    return {
      ...notSupported("withdrawListing"),
      message:
        "OferteImobiliare nu oferă endpoint de retragere. Anunțul trebuie dezactivat din contul agenției pe portal.",
    };
  },

  async sync(ctx, refs) {
    let processed = 0;
    let failed = 0;
    for (const ref of refs) {
      const res = await push(ctx, ref, "update");
      if (res.ok) processed += 1;
      else failed += 1;
    }
    return { ok: true, data: { processed, failed } };
  },

  async fetchListings(ctx) {
    if (!configured(ctx)) return configError("fetch_listings");
    if (!ctx.allowLiveRequests) return notSupported("fetchListings(dry_run)");
    try {
      const res = await request(ctx, "POST", "/properties", {});
      if (res.status !== 200) {
        const f = failure(res, "fetch_listings");
        return { ok: false, code: f.code, message: f.message, detail: f.detail };
      }
      const list = Array.isArray(res.list)
        ? res.list
        : Array.isArray(res.body?.["data"])
          ? (res.body["data"] as unknown[])
          : [];
      return { ok: true, data: list };
    } catch (error) {
      return fromThrown(error, "fetch_listings");
    }
  },

  /** Diagnoză locală: exact ce ar refuza portalul, înainte de orice request. */
  async diagnoseListing(ctx, ref): Promise<PortalResult<ListingDiagnostics>> {
    const build = await payloadFor(ctx, ref);
    const listing = build.ok ? build.listings[0] : null;
    return {
      ok: true,
      data: {
        feedVisible: build.ok,
        externalId: build.ok ? build.listings.map((l) => l.id).join(",") : null,
        offerUrl: listing?.url ?? null,
        agentId: null,
        agentName: listing?.agent ?? null,
        images: {
          total: listing?.public_images.length ?? 0,
          resolvable: listing?.public_images.length ?? 0,
          broken: 0,
          primary: (listing?.public_images.length ?? 0) > 0,
        },
        updatedAt: listing?.updated_at ?? null,
        notes: build.ok ? build.warnings : build.reasons,
      },
    };
  },
};
