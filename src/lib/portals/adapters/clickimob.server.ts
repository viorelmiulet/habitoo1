/**
 * Adaptor ClickImob — implementează STRICT ce există în ClickImob azi.
 *
 * Modelul real (verificat în proiectul ClickImob):
 *  - ClickImob nu are API general de creare/editare/ștergere anunțuri.
 *  - CRM-ul notifică portalul că o proprietate s-a modificat:
 *      POST https://www.clickimob.ro/api/public/crm-webhook
 *           ?agency=<agency_id>&token=<webhook_token>&provider=immoflux
 *      body: { "id": "<property_id>" }
 *  - ClickImob citește apoi datele din feedul CRM-ului (direcția portal → Habitoo),
 *    folosind o cheie emisă de Habitoo.
 *
 * Deci publish/update/withdraw se traduc TOATE în aceeași notificare, iar
 * retragerea depinde de faptul că oferta nu mai este eligibilă în feed.
 * Import de anunțuri/agenți din ClickImob: NOT_SUPPORTED.
 */
import {
  notSupported,
  type ConnectionStatusOutcome,
  type ListingOutcome,
  type ListingRef,
  type PortalAdapter,
  type PortalContext,
  type PortalResult,
} from "../adapter";
import { PORTAL_ERROR_MESSAGE, codeFromHttpStatus, toPortalError } from "../errors";

const DEFAULT_ENDPOINT = "https://www.clickimob.ro/api/public/crm-webhook";
/** SSRF guard: nu contactăm niciodată un host nedeclarat. */
const ALLOWED_HOSTS = new Set(["clickimob.ro", "www.clickimob.ro"]);
const TIMEOUT_MS = 10_000;

function endpointOf(ctx: PortalContext): string {
  const raw = typeof ctx.settings["endpoint_url"] === "string" ? String(ctx.settings["endpoint_url"]) : "";
  return raw.trim() || DEFAULT_ENDPOINT;
}

function buildRequestUrl(ctx: PortalContext): URL {
  const url = new URL(endpointOf(ctx));
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
    throw Object.assign(new Error("blocked_host"), { portalCode: "CONFIG_ERROR" as const });
  }
  // Query parameter impus explicit de API-ul public ClickImob.
  url.searchParams.set("agency", ctx.externalAccountId ?? "");
  url.searchParams.set("token", ctx.portalCredential ?? "");
  url.searchParams.set("provider", "immoflux");
  return url;
}

/** URL sigur pentru afișare/logare: tokenul este mascat. */
function safeUrl(ctx: PortalContext): string {
  try {
    const url = new URL(endpointOf(ctx));
    url.searchParams.set("agency", ctx.externalAccountId ?? "");
    url.searchParams.set("token", "***");
    url.searchParams.set("provider", "immoflux");
    return url.toString();
  } catch {
    return endpointOf(ctx);
  }
}

function configured(ctx: PortalContext): boolean {
  return Boolean(ctx.externalAccountId && ctx.portalCredential);
}

async function notify(ctx: PortalContext, ref: ListingRef, operation: string): Promise<PortalResult<ListingOutcome>> {
  if (!configured(ctx)) {
    return { ok: false, code: "CONFIG_ERROR", message: PORTAL_ERROR_MESSAGE.CONFIG_ERROR, detail: operation };
  }
  if (!ctx.allowLiveRequests) {
    return {
      ok: true,
      data: {
        externalId: ref.externalId,
        live: false,
        detail: `dry_run ${operation} → ${safeUrl(ctx)}`,
      },
    };
  }
  try {
    const url = buildRequestUrl(ctx);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: ref.propertyId }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      const code = codeFromHttpStatus(response.status);
      // Răspunsul brut al portalului, trunchiat, ca administratorul să vadă
      // eroarea EXACTĂ. Nu conține credențiale (tokenul e doar în URL).
      let body = "";
      try {
        body = (await response.text()).slice(0, 300).replace(/\s+/g, " ").trim();
      } catch {
        body = "";
      }
      const message = `${PORTAL_ERROR_MESSAGE[code]} Răspuns portal: HTTP ${response.status}${body ? ` — ${body}` : ""}`;
      return { ok: false, code, message, detail: `${operation} http_${response.status} ${body}`.trim() };
    }

    return {
      ok: true,
      data: { externalId: ref.externalId, live: true, detail: `${operation} http_${response.status}` },
    };
  } catch (error) {
    if ((error as { portalCode?: string }).portalCode === "CONFIG_ERROR") {
      return { ok: false, code: "CONFIG_ERROR", message: "Adresa webhook nu este permisă.", detail: "blocked_host" };
    }
    const normalized = toPortalError(error);
    return { ok: false, code: normalized.code, message: normalized.message, detail: normalized.detail };
  }
}

async function status(ctx: PortalContext): Promise<PortalResult<ConnectionStatusOutcome>> {
  return {
    ok: true,
    data: {
      configured: configured(ctx),
      live: false,
      detail: configured(ctx) ? `configurat → ${safeUrl(ctx)}` : "credențiale incomplete",
    },
  };
}

export const clickimobAdapter: PortalAdapter = {
  id: "clickimob",

  async testConnection(ctx) {
    if (!configured(ctx)) {
      return { ok: false, code: "CONFIG_ERROR", message: PORTAL_ERROR_MESSAGE.CONFIG_ERROR, detail: "test" };
    }
    if (!ctx.allowLiveRequests) return status(ctx);
    // Testul „live” folosește exact endpointul documentat. Fără o proprietate
    // reală nu inventăm un endpoint de ping: testul se face la publicare.
    return status(ctx);
  },

  getStatus: status,

  publishListing: (ctx, ref) => notify(ctx, ref, "publish"),
  updateListing: (ctx, ref) => notify(ctx, ref, "update"),
  withdrawListing: (ctx, ref) => notify(ctx, ref, "withdraw"),
  webhookSend: (ctx, ref) => notify(ctx, ref, "webhook_send"),

  async sync(ctx, refs) {
    let processed = 0;
    let failed = 0;
    for (const ref of refs) {
      const result = await notify(ctx, ref, "sync");
      if (result.ok) processed += 1;
      else failed += 1;
    }
    return { ok: true, data: { processed, failed } };
  },

  // Operații pe care ClickImob NU le expune pentru CRM-uri.
  async fetchListings() {
    return notSupported("fetchListings");
  },
  async fetchAgents() {
    return notSupported("fetchAgents");
  },
  async publishBulk() {
    return notSupported("publishBulk");
  },
  async webhookReceive() {
    return notSupported("webhookReceive");
  },
};

export const CLICKIMOB_DEFAULT_ENDPOINT = DEFAULT_ENDPOINT;
export const clickimobSafeUrl = safeUrl;
