/**
 * Adaptor ClickImob — exclusiv prin index (feed), ca Properstar.
 *
 * ClickImob preia agențiile din indexul Habitoo și citește ofertele din feed.
 * Nu există conexiune pe agenție (ID agenție, token webhook, chei Habitoo) și
 * nu trimitem nicio cerere către ClickImob: publish/update/withdraw fac doar
 * verificarea feedului. Notificarea instant la nivel de platformă vine separat.
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

/** Diagnoza feedului pentru o ofertă: ce va citi portalul, în realitate. */
async function diagnose(ctx: PortalContext, ref: ListingRef): Promise<ListingDiagnostics> {
  const { inspectFeedMedia, inspectFeedProperty } = await import("../feed-inspect.server");
  const [property, media] = await Promise.all([
    inspectFeedProperty(ctx.organizationId, ref.propertyId, "clickimob"),
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
  // Preflight real: verificăm ce va găsi portalul în feed.
  const diagnostics = await diagnose(ctx, ref);
  if (options.expect === "visible" && !diagnostics.feedVisible) {
    return {
      ok: false,
      code: "VALIDATION_ERROR",
      message:
        "Oferta nu este vizibilă în feedul citit de ClickImob. " + diagnostics.notes.join(" "),
      detail: `${operation} feed_not_visible`,
    };
  }
  const withdrawWarning =
    options.expect === "absent" && diagnostics.feedVisible
      ? " Atenție: oferta este încă publicată în feed, deci ClickImob o poate reimporta. Oprește publicarea pe site pentru retragere definitivă."
      : "";
  return {
    ok: true,
    data: {
      externalId: diagnostics.externalId ?? ref.externalId,
      live: false,
      feedVisible: diagnostics.feedVisible,
      processed: null,
      detail: `index ${operation}`,
      message: `ClickImob preia modificarea din feed în cel mult 15 minute.${withdrawWarning}`,
    },
  };
}

/** Statusul real: feedul pe care îl citește portalul + configurarea locală. */
async function status(ctx: PortalContext): Promise<PortalResult<ConnectionStatusOutcome>> {
  const { CRM_URL } = await import("@/lib/host");
  const feedUrl = `${CRM_URL}/api/public/portal/v1/properties`;
  try {
    const { inspectFeedAgents, inspectFeedProperties } = await import("../feed-inspect.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [properties, agents, keys] = await Promise.all([
      inspectFeedProperties(ctx.organizationId, 1, "clickimob"),
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
        configured: true,
        live: false,
        detail: "index ClickImob",
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
    return {
      ok: false,
      code: normalized.code,
      message: normalized.message,
      detail: normalized.detail,
    };
  }
}

export const clickimobAdapter: PortalAdapter = {
  id: "clickimob",

  async testConnection(ctx) {
    const result = await status(ctx);
    if (!result.ok) return result;
    if (!result.data.feed?.ok) {
      return {
        ok: false,
        code: "FEED_ERROR",
        message: "Feedul Habitoo nu răspunde corect.",
        detail: "feed_check",
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
      return {
        ok: false,
        code: normalized.code,
        message: normalized.message,
        detail: normalized.detail,
      };
    }
  },

  /**
   * Anunțurile pe care portalul le vede în feedul Habitoo. ClickImob nu expune
   * propriul inventar, deci sursa de adevăr este feedul nostru.
   */
  async fetchListings(ctx) {
    try {
      const { inspectFeedProperties } = await import("../feed-inspect.server");
      const snapshot = await inspectFeedProperties(ctx.organizationId, 50, "clickimob");
      if (snapshot.status !== 200) {
        return {
          ok: false,
          code: "FEED_ERROR",
          message: "Feedul de oferte nu a răspuns.",
          detail: `http_${snapshot.status}`,
        };
      }
      return {
        ok: true,
        data: [
          { total: snapshot.total, page_items: snapshot.items, api_version: snapshot.apiVersion },
        ],
      };
    } catch (error) {
      const normalized = toPortalError(error);
      return {
        ok: false,
        code: normalized.code,
        message: normalized.message,
        detail: normalized.detail,
      };
    }
  },

  /** Agenții expuși portalului prin `/agents`. */
  async fetchAgents(ctx) {
    try {
      const { inspectFeedAgents } = await import("../feed-inspect.server");
      const snapshot = await inspectFeedAgents(ctx.organizationId);
      if (snapshot.status !== 200) {
        return {
          ok: false,
          code: "FEED_ERROR",
          message: "Feedul de agenți nu a răspuns.",
          detail: `http_${snapshot.status}`,
        };
      }
      return { ok: true, data: [{ total: snapshot.total, api_version: snapshot.apiVersion }] };
    } catch (error) {
      const normalized = toPortalError(error);
      return {
        ok: false,
        code: normalized.code,
        message: normalized.message,
        detail: normalized.detail,
      };
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

