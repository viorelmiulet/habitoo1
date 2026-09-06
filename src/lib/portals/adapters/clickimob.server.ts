/**
 * Adaptor ClickImob — implementează STRICT ce există în ClickImob azi.
 *
 * Modelul real (verificat în proiectul ClickImob):
 *  - ClickImob nu are API de creare/editare/ștergere directă a anunțurilor.
 *  - CRM-ul notifică portalul că o proprietate s-a modificat:
 *      POST https://www.clickimob.ro/api/public/crm-webhook
 *           ?agency=<agency_id>&token=<webhook_token>&provider=immoflux
 *      body: { "id": "<property_id>" }
 *  - ClickImob citește apoi datele (ofertă, imagini, agent) din feedul Habitoo,
 *    folosind o cheie emisă de Habitoo.
 *
 * De aceea fiecare operație are DOUĂ jumătăți reale, ambele implementate aici:
 *  1. partea Habitoo — ce va găsi portalul în feed (ofertă, imagini, agent);
 *  2. notificarea către portal — cu răspunsul lui, afișat exact.
 *
 * publish/update/withdraw folosesc același webhook, dar cu preflight diferit:
 *  - publish/update cer ca oferta să fie VIZIBILĂ în feed;
 *  - withdraw cere ca oferta să NU mai fie vizibilă (altfel portalul o
 *    re-importă imediat), iar ClickImob o dezactivează la re-citire.
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

/** Diagnoza feedului pentru o ofertă: ce va citi portalul, în realitate. */
async function diagnose(ctx: PortalContext, ref: ListingRef): Promise<ListingDiagnostics> {
  const { inspectFeedMedia, inspectFeedProperty } = await import("../feed-inspect.server");
  const [property, media] = await Promise.all([
    inspectFeedProperty(ctx.organizationId, ref.propertyId),
    inspectFeedMedia(ctx.organizationId, ref.propertyId),
  ]);

  const notes: string[] = [];
  if (!property.visible) notes.push("Oferta nu apare în feedul citit de portal.");
  if (property.visible && media.total === 0) notes.push("Oferta nu are nicio imagine publicabilă.");
  if (media.broken > 0) notes.push(`${media.broken} imagini nu pot fi servite portalului.`);
  if (property.visible && media.total > 0 && !media.primary) {
    notes.push("Nu este setată o imagine principală.");
  }
  if (property.visible && !property.agentId) notes.push("Oferta nu are agent asignat.");

  return {
    feedVisible: property.visible,
    externalId: property.externalId,
    offerUrl: property.offerUrl,
    agentId: property.agentId,
    agentName: property.agentName,
    images: {
      total: media.total,
      resolvable: media.resolvable,
      broken: media.broken,
      primary: media.primary,
    },
    updatedAt: property.updatedAt,
    notes,
  };
}

type NotifyOptions = {
  /** Ce trebuie să fie adevărat în feed înainte de notificare. */
  expect: "visible" | "absent";
};

async function notify(
  ctx: PortalContext,
  ref: ListingRef,
  operation: string,
  options: NotifyOptions,
): Promise<PortalResult<ListingOutcome>> {
  if (!configured(ctx)) {
    return { ok: false, code: "CONFIG_ERROR", message: PORTAL_ERROR_MESSAGE.CONFIG_ERROR, detail: operation };
  }

  // Preflight real: verificăm ce va găsi portalul, nu ce presupunem noi.
  const diagnostics = await diagnose(ctx, ref);
  if (options.expect === "visible" && !diagnostics.feedVisible) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message:
        "Oferta nu este vizibilă în feedul citit de portal, deci notificarea nu ar avea ce importa. " +
        diagnostics.notes.join(" "),
      detail: `${operation} feed_not_visible`,
    };
  }
  // La retragere nu blocăm operațiunea: notificăm portalul oricum, dar avertizăm
  // dacă oferta e încă în feed, pentru că atunci portalul o va reimporta.
  const withdrawWarning =
    options.expect === "absent" && diagnostics.feedVisible
      ? "Atenție: oferta este încă publicată în feed, deci portalul o poate reimporta. Oprește publicarea pe site pentru retragere definitivă."
      : null;


  const externalId = diagnostics.externalId ?? ref.externalId;

  if (!ctx.allowLiveRequests) {
    return {
      ok: true,
      data: {
        externalId,
        live: false,
        feedVisible: diagnostics.feedVisible,
        processed: null,
        detail: `dry_run ${operation} → ${safeUrl(ctx)}`,
        message: `Verificat local: feed ${diagnostics.feedVisible ? "OK" : "indisponibil"}, ${diagnostics.images.resolvable}/${diagnostics.images.total} imagini, agent ${diagnostics.agentName ?? "lipsă"}.${withdrawWarning ? ` ${withdrawWarning}` : ""}`,
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

    let raw = "";
    try {
      raw = (await response.text()).slice(0, 600);
    } catch {
      raw = "";
    }
    const compact = raw.replace(/\s+/g, " ").trim().slice(0, 300);

    if (!response.ok) {
      const code = codeFromHttpStatus(response.status);
      // Răspunsul brut al portalului, trunchiat, ca administratorul să vadă
      // eroarea EXACTĂ. Nu conține credențiale (tokenul e doar în URL).
      const message = `${PORTAL_ERROR_MESSAGE[code]} Răspuns portal: HTTP ${response.status}${compact ? ` — ${compact}` : ""}`;
      return { ok: false, code, message, detail: `${operation} http_${response.status} ${compact}`.trim() };
    }

    let processed: number | null = null;
    try {
      const body = JSON.parse(raw) as Record<string, unknown>;
      if (typeof body["processed"] === "number") processed = body["processed"];
    } catch {
      processed = null;
    }

    return {
      ok: true,
      data: {
        externalId,
        live: true,
        feedVisible: diagnostics.feedVisible,
        processed,
        detail: `${operation} http_${response.status}${processed === null ? "" : ` processed=${processed}`}`,
        message:
          (processed === null
            ? `Portalul a confirmat notificarea (HTTP ${response.status}).`
            : `Portalul a procesat ${processed} anunț(uri).`) + (withdrawWarning ? ` ${withdrawWarning}` : ""),
      },
    };
  } catch (error) {
    if ((error as { portalCode?: string }).portalCode === "CONFIG_ERROR") {
      return { ok: false, code: "CONFIG_ERROR", message: "Adresa webhook nu este permisă.", detail: "blocked_host" };
    }
    const normalized = toPortalError(error);
    return { ok: false, code: normalized.code, message: normalized.message, detail: normalized.detail };
  }
}

/** Statusul real: feedul pe care îl citește portalul + configurarea locală. */
async function status(ctx: PortalContext): Promise<PortalResult<ConnectionStatusOutcome>> {
  const { CRM_URL } = await import("@/lib/host");
  const feedUrl = `${CRM_URL}/api/public/portal/v1/properties`;
  try {
    const { inspectFeedAgents, inspectFeedProperties } = await import("../feed-inspect.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [properties, agents, keys] = await Promise.all([
      inspectFeedProperties(ctx.organizationId),
      inspectFeedAgents(ctx.organizationId),
      supabaseAdmin
        .from("portal_api_keys")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", ctx.organizationId)
        .eq("portal", "clickimob")
        .eq("status", "active"),
    ]);

    const feedOk = properties.status === 200 && agents.status === 200;
    return {
      ok: true,
      data: {
        configured: configured(ctx),
        live: false,
        detail: configured(ctx) ? `configurat → ${safeUrl(ctx)}` : "credențiale incomplete",
        feed: {
          ok: feedOk,
          apiVersion: properties.apiVersion,
          properties: properties.total,
          agents: agents.total,
          activeKeys: keys.count ?? 0,
          url: feedUrl,
        },
      },
    };
  } catch (error) {
    const normalized = toPortalError(error);
    return { ok: false, code: normalized.code, message: normalized.message, detail: normalized.detail };
  }
}

export const clickimobAdapter: PortalAdapter = {
  id: "clickimob",

  async testConnection(ctx) {
    if (!configured(ctx)) {
      return { ok: false, code: "CONFIG_ERROR", message: PORTAL_ERROR_MESSAGE.CONFIG_ERROR, detail: "test" };
    }
    // ClickImob nu documentează un endpoint de ping; testul real verifică
    // feedul pe care îl va citi portalul plus cheia emisă de Habitoo.
    const result = await status(ctx);
    if (!result.ok) return result;
    if (!result.data.feed?.ok) {
      return { ok: false, code: "FEED_ERROR", message: "Feedul Habitoo nu răspunde corect.", detail: "feed_check" };
    }
    if ((result.data.feed.activeKeys ?? 0) === 0) {
      return {
        ok: false,
        code: "CONFIG_ERROR",
        message: "Portalul nu are nicio cheie activă emisă de Habitoo pentru citirea feedului.",
        detail: "missing_habitoo_key",
      };
    }
    return result;
  },

  getStatus: status,

  publishListing: (ctx, ref) => notify(ctx, ref, "publish", { expect: "visible" }),
  updateListing: (ctx, ref) => notify(ctx, ref, "update", { expect: "visible" }),
  withdrawListing: (ctx, ref) => notify(ctx, ref, "withdraw", { expect: "absent" }),
  webhookSend: (ctx, ref) => notify(ctx, ref, "webhook_send", { expect: "visible" }),

  async diagnoseListing(ctx, ref) {
    try {
      return { ok: true, data: await diagnose(ctx, ref) };
    } catch (error) {
      const normalized = toPortalError(error);
      return { ok: false, code: normalized.code, message: normalized.message, detail: normalized.detail };
    }
  },

  /**
   * Anunțurile pe care portalul le vede în feedul Habitoo. ClickImob nu expune
   * propriul inventar, deci sursa de adevăr este feedul nostru.
   */
  async fetchListings(ctx) {
    try {
      const { inspectFeedProperties } = await import("../feed-inspect.server");
      const snapshot = await inspectFeedProperties(ctx.organizationId, 50);
      if (snapshot.status !== 200) {
        return { ok: false, code: "FEED_ERROR", message: "Feedul de oferte nu a răspuns.", detail: `http_${snapshot.status}` };
      }
      return { ok: true, data: [{ total: snapshot.total, page_items: snapshot.items, api_version: snapshot.apiVersion }] };
    } catch (error) {
      const normalized = toPortalError(error);
      return { ok: false, code: normalized.code, message: normalized.message, detail: normalized.detail };
    }
  },

  /** Agenții expuși portalului prin `/agents`. */
  async fetchAgents(ctx) {
    try {
      const { inspectFeedAgents } = await import("../feed-inspect.server");
      const snapshot = await inspectFeedAgents(ctx.organizationId);
      if (snapshot.status !== 200) {
        return { ok: false, code: "FEED_ERROR", message: "Feedul de agenți nu a răspuns.", detail: `http_${snapshot.status}` };
      }
      return { ok: true, data: [{ total: snapshot.total, api_version: snapshot.apiVersion }] };
    } catch (error) {
      const normalized = toPortalError(error);
      return { ok: false, code: normalized.code, message: normalized.message, detail: normalized.detail };
    }
  },

  async sync(ctx, refs) {
    let processed = 0;
    let failed = 0;
    for (const ref of refs) {
      const result = await notify(ctx, ref, "sync", { expect: "visible" });
      if (result.ok) processed += 1;
      else failed += 1;
    }
    return { ok: true, data: { processed, failed } };
  },

  async publishBulk(ctx, refs) {
    let processed = 0;
    for (const ref of refs) {
      const result = await notify(ctx, ref, "publish_bulk", { expect: "visible" });
      if (result.ok) processed += 1;
    }
    return { ok: true, data: { processed } };
  },

  // ClickImob nu trimite notificări către CRM: fluxul lui este pull din feed.
  async webhookReceive() {
    return notSupported("webhookReceive");
  },
};

export const CLICKIMOB_DEFAULT_ENDPOINT = DEFAULT_ENDPOINT;
export const clickimobSafeUrl = safeUrl;
