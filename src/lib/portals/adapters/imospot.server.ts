/**
 * Adaptor Imospot.ro — REST clasic, PUSH direct (nu webhook-notify, nu feed-pull).
 *
 * Contract implementat:
 *   POST   {base}/listings                 creare sau actualizare (idempotent pe external_id)
 *   PUT    {base}/listings/{external_id}   actualizare explicită (404 → fallback POST)
 *   DELETE {base}/listings/{external_id}   retragere (anunțul devine „archived”)
 *   GET    {base}/account                  verificare cheie + sold credite (testConnection)
 *
 * Autentificare: `Authorization: Bearer <cheie emisă de Imospot>`, salvată de
 * utilizator în Habitoo (nu o generăm noi). Credențialul nu se loghează niciodată.
 *
 * Validarea obligatorie se face LOCAL, înainte de orice request: titlu, descriere
 * (min. 60 caractere), preț întreg pozitiv, telefon, județ + localitate, minimum
 * o imagine. Când ceva lipsește, utilizatorul vede motivul exact, nu o eroare API.
 */
import {
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
import { imospotExternalId, type ImospotListing, type ImospotTransaction } from "../imospot/mapper";

const DEFAULT_BASE_URL = "https://www.imospot.ro/api/v1";
/** SSRF guard: nu contactăm niciodată un host nedeclarat. */
const ALLOWED_HOSTS = new Set(["imospot.ro", "www.imospot.ro"]);
const TIMEOUT_MS = 10_000;

function baseUrlOf(ctx: PortalContext): string {
  const raw = typeof ctx.settings["endpoint_url"] === "string" ? String(ctx.settings["endpoint_url"]) : "";
  return (raw.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function endpoint(ctx: PortalContext, path: string): URL {
  const url = new URL(`${baseUrlOf(ctx)}${path}`);
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
    throw Object.assign(new Error("blocked_host"), { portalCode: "CONFIG_ERROR" as const });
  }
  return url;
}

function configured(ctx: PortalContext): boolean {
  return Boolean(ctx.portalCredential && ctx.portalCredential.trim());
}

type ApiResponse = {
  status: number;
  body: Record<string, unknown> | null;
  raw: string;
};

async function request(
  ctx: PortalContext,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  payload?: unknown,
  retry = true,
): Promise<ApiResponse> {
  const url = endpoint(ctx, path);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers: {
        authorization: `Bearer ${ctx.portalCredential ?? ""}`,
        accept: "application/json",
        ...(payload === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  // 429: respectăm `Retry-After` dacă există, altfel un singur backoff scurt.
  if (response.status === 429 && retry) {
    const header = Number(response.headers.get("retry-after"));
    const waitMs = Number.isFinite(header) && header > 0 ? Math.min(header, 10) * 1000 : 2000;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return request(ctx, method, path, payload, false);
  }

  let raw = "";
  try {
    raw = (await response.text()).slice(0, 1500);
  } catch {
    raw = "";
  }
  let body: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    body = null;
  }
  return { status: response.status, body, raw };
}

/** Mesaj clar pentru utilizator din răspunsul portalului (fără secrete). */
function failure(res: ApiResponse, operation: string): { code: PortalErrorCode; message: string; detail: string } {
  const code = codeFromHttpStatus(res.status);
  const compact = res.raw.replace(/\s+/g, " ").trim().slice(0, 300);

  if (res.status === 401 || res.status === 403) {
    return {
      code: "AUTH_ERROR",
      message: "Imospot a refuzat cheia API. Verifică cheia salvată pentru agenție.",
      detail: `${operation} http_${res.status}`,
    };
  }
  if (res.status === 422) {
    const errors = res.body?.["errors"];
    let fields = "";
    if (errors && typeof errors === "object") {
      fields = Object.entries(errors as Record<string, unknown>)
        .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
        .join(" • ")
        .slice(0, 400);
    }
    return {
      code: "VALIDATION_ERROR",
      message: `Imospot a respins datele anunțului. ${fields || compact}`.trim(),
      detail: `${operation} http_422 ${fields || compact}`.trim(),
    };
  }
  return {
    code,
    message: `${PORTAL_ERROR_MESSAGE[code]} Răspuns portal: HTTP ${res.status}${compact ? ` — ${compact}` : ""}`,
    detail: `${operation} http_${res.status} ${compact}`.trim(),
  };
}

type ListingEcho = { id: string | null; url: string | null; state: string | null };

function readListing(res: ApiResponse): ListingEcho {
  const listing = (res.body?.["listing"] ?? res.body?.["data"] ?? res.body) as Record<string, unknown> | null;
  const value = (key: string) => {
    const raw = listing?.[key];
    return typeof raw === "string" || typeof raw === "number" ? String(raw) : null;
  };
  return { id: value("id"), url: value("url"), state: value("state") };
}

async function payloadFor(ctx: PortalContext, ref: ListingRef) {
  const { buildImospotPayload } = await import("../imospot/payload.server");
  return buildImospotPayload({ organizationId: ctx.organizationId, propertyId: ref.propertyId });
}

function dryRun(listings: ImospotListing[], warnings: string[], operation: string): PortalResult<ListingOutcome> {
  return {
    ok: true,
    data: {
      externalId: listings.map((l) => l.external_id).join(","),
      live: false,
      processed: listings.length,
      detail: `dry_run ${operation} listings=${listings.length}`,
      message:
        `Verificat local: ${listings.length} anunț(uri) valide, ${listings[0]?.images.length ?? 0} imagini.` +
        (warnings.length ? ` ${warnings.join(" ")}` : ""),
    },
  };
}

type PushMode = "create_or_update" | "update";

async function push(ctx: PortalContext, ref: ListingRef, mode: PushMode): Promise<PortalResult<ListingOutcome>> {
  if (!configured(ctx)) {
    return {
      ok: false,
      code: "CONFIG_ERROR",
      message: "Cheia API Imospot nu este salvată pentru această agenție.",
      detail: mode,
    };
  }

  const build = await payloadFor(ctx, ref);
  if (!build.ok) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message: `Oferta nu poate fi trimisă la Imospot: ${build.reasons.join(" ")}`,
      detail: `${mode} not_eligible`,
    };
  }

  if (!ctx.allowLiveRequests) return dryRun(build.listings, build.warnings, mode);

  const echoes: string[] = [];
  const urls: string[] = [];
  const states: string[] = [];
  try {
    for (const listing of build.listings) {
      let res =
        mode === "update"
          ? await request(ctx, "PUT", `/listings/${encodeURIComponent(listing.external_id)}`, listing)
          : await request(ctx, "POST", "/listings", listing);

      // PUT pe un external_id necunoscut: creăm anunțul, nu raportăm eroare.
      if (mode === "update" && res.status === 404) {
        res = await request(ctx, "POST", "/listings", listing);
      }

      if (res.status !== 200 && res.status !== 201) {
        const f = failure(res, mode);
        return { ok: false, code: f.code, message: f.message, detail: f.detail };
      }
      const echo = readListing(res);
      if (echo.id) echoes.push(echo.id);
      if (echo.url) urls.push(echo.url);
      if (echo.state) states.push(echo.state);
    }
  } catch (error) {
    if ((error as { portalCode?: string }).portalCode === "CONFIG_ERROR") {
      return { ok: false, code: "CONFIG_ERROR", message: "Adresa API Imospot nu este permisă.", detail: "blocked_host" };
    }
    const normalized = toPortalError(error);
    return { ok: false, code: normalized.code, message: normalized.message, detail: normalized.detail };
  }

  const stateText = states.length ? ` Stare: ${[...new Set(states)].join(", ")}.` : "";
  return {
    ok: true,
    data: {
      externalId: echoes.join(",") || build.listings.map((l) => l.external_id).join(","),
      live: true,
      processed: build.listings.length,
      detail: `${mode} ok listings=${build.listings.length}${echoes.length ? ` ids=${echoes.join(",")}` : ""}`,
      message:
        `Imospot a acceptat ${build.listings.length} anunț(uri).${stateText}` +
        (urls.length ? ` Link: ${urls.join(" ")}` : "") +
        (build.warnings.length ? ` ${build.warnings.join(" ")}` : ""),
    },
  };
}

/** Retragerea acoperă ambele variante posibile de tranzacție ale ofertei. */
async function withdraw(ctx: PortalContext, ref: ListingRef): Promise<PortalResult<ListingOutcome>> {
  if (!configured(ctx)) {
    return {
      ok: false,
      code: "CONFIG_ERROR",
      message: "Cheia API Imospot nu este salvată pentru această agenție.",
      detail: "withdraw",
    };
  }

  const transactions: ImospotTransaction[] = ["sale", "rent"];
  const ids = transactions.map((t) => imospotExternalId({ id: ref.propertyId }, t));

  if (!ctx.allowLiveRequests) {
    return {
      ok: true,
      data: {
        externalId: ids.join(","),
        live: false,
        processed: ids.length,
        detail: `dry_run withdraw ${ids.join(",")}`,
        message: "Verificat local: retragerea ar arhiva anunțurile la Imospot.",
      },
    };
  }

  const archived: string[] = [];
  const missing: string[] = [];
  try {
    for (const id of ids) {
      const res = await request(ctx, "DELETE", `/listings/${encodeURIComponent(id)}`);
      if (res.status === 200 || res.status === 204) {
        archived.push(id);
        continue;
      }
      // 404 = anunțul nu există la portal, deci nu e nimic de retras.
      if (res.status === 404) {
        missing.push(id);
        continue;
      }
      const f = failure(res, "withdraw");
      return { ok: false, code: f.code, message: f.message, detail: f.detail };
    }
  } catch (error) {
    if ((error as { portalCode?: string }).portalCode === "CONFIG_ERROR") {
      return { ok: false, code: "CONFIG_ERROR", message: "Adresa API Imospot nu este permisă.", detail: "blocked_host" };
    }
    const normalized = toPortalError(error);
    return { ok: false, code: normalized.code, message: normalized.message, detail: normalized.detail };
  }

  return {
    ok: true,
    data: {
      externalId: (archived.length ? archived : ids).join(","),
      live: true,
      processed: archived.length,
      detail: `withdraw archived=${archived.length} missing=${missing.length}`,
      message: archived.length
        ? `Imospot a arhivat ${archived.length} anunț(uri). Revin live la o nouă publicare.`
        : "Oferta nu era publicată la Imospot; nu a fost nimic de retras.",
    },
  };
}

/** Statusul real al conexiunii: GET /account confirmă cheia și soldul. */
async function status(ctx: PortalContext, live: boolean): Promise<PortalResult<ConnectionStatusOutcome>> {
  if (!configured(ctx)) {
    return {
      ok: true,
      data: {
        configured: false,
        live: false,
        detail: "Cheia API Imospot lipsește.",
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
          ? "Cheie API salvată; testează conexiunea pentru confirmare."
          : "Cheie API salvată; requesturile live sunt dezactivate pentru această agenție.",
      },
    };
  }

  try {
    const res = await request(ctx, "GET", "/account");
    if (res.status !== 200) {
      const f = failure(res, "test_connection");
      return { ok: false, code: f.code, message: f.message, detail: f.detail };
    }
    const account = (res.body?.["account"] ?? res.body ?? {}) as Record<string, unknown>;
    const name = typeof account["name"] === "string" ? account["name"] : null;
    const credits =
      typeof account["credits"] === "number"
        ? account["credits"]
        : typeof account["promotion_credits"] === "number"
          ? (account["promotion_credits"] as number)
          : null;
    return {
      ok: true,
      data: {
        configured: true,
        live: true,
        detail:
          `Cheie validă${name ? ` — cont ${name}` : ""}` +
          (credits === null ? "." : `, credite de promovare: ${credits}.`),
      },
    };
  } catch (error) {
    if ((error as { portalCode?: string }).portalCode === "CONFIG_ERROR") {
      return { ok: false, code: "CONFIG_ERROR", message: "Adresa API Imospot nu este permisă.", detail: "blocked_host" };
    }
    const normalized = toPortalError(error);
    return { ok: false, code: normalized.code, message: normalized.message, detail: normalized.detail };
  }
}

export const imospotAdapter: PortalAdapter = {
  id: "imospot",

  async testConnection(ctx) {
    return status(ctx, true);
  },

  async getStatus(ctx) {
    return status(ctx, false);
  },

  async publishListing(ctx, ref) {
    return push(ctx, ref, "create_or_update");
  },

  async updateListing(ctx, ref) {
    return push(ctx, ref, "update");
  },

  async withdrawListing(ctx, ref) {
    return withdraw(ctx, ref);
  },

  async sync(ctx, refs) {
    let processed = 0;
    let failed = 0;
    for (const ref of refs) {
      const res = await push(ctx, ref, "create_or_update");
      if (res.ok) processed += 1;
      else failed += 1;
    }
    return { ok: true, data: { processed, failed } };
  },

  /** Diagnoză locală: exact ce ar refuza Imospot, înainte de orice request. */
  async diagnoseListing(ctx, ref): Promise<PortalResult<ListingDiagnostics>> {
    const build = await payloadFor(ctx, ref);
    const listing = build.ok ? build.listings[0] : null;
    return {
      ok: true,
      data: {
        feedVisible: build.ok,
        externalId: build.ok ? build.listings.map((l) => l.external_id).join(",") : null,
        offerUrl: null,
        agentId: null,
        agentName: listing?.contact.agent?.name ?? null,
        images: {
          total: listing?.images.length ?? 0,
          resolvable: listing?.images.length ?? 0,
          broken: 0,
          primary: (listing?.images.length ?? 0) > 0,
        },
        updatedAt: null,
        notes: build.ok ? build.warnings : build.reasons,
      },
    };
  },
};
