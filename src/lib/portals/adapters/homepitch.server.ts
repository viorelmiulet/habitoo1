/**
 * Adaptor HomePitch.ro — model MIXT:
 *
 *  1. PULL (principal): HomePitch citește endpointurile
 *     `/api/public/homepitch/v1/*` cu o cheie API emisă de Habitoo
 *     (agency-wide). Intrarea și ieșirea din feed sunt mecanismul real de
 *     publicare/retragere.
 *  2. PUSH punctual (opțional): la bifarea unei oferte, anunțăm HomePitch să o
 *     importe imediat, cu `POST .../crm-push-property`.
 *
 * Retragerea nu are un endpoint la HomePitch: oferta debifată dispare din feed
 * și portalul o arhivează la următoarea sincronizare.
 */
import type {
  ConnectionStatusOutcome,
  ListingDiagnostics,
  ListingOutcome,
  ListingRef,
  PortalAdapter,
  PortalContext,
  PortalResult,
} from "@/lib/portals/adapter";
import { HOMEPITCH_API_VERSION, HOMEPITCH_BASE_PATH } from "@/lib/portals/homepitch/auth.server";
import { buildHomePitchFeed } from "@/lib/portals/homepitch/feed.server";

/** Endpointul fix al HomePitch pentru importul punctual. */
const PUSH_ENDPOINT =
  "https://bwfexvoapabfvkmmnxkg.supabase.co/functions/v1/crm-push-property";

/**
 * Cheia publică (anon) a proiectului HomePitch. NU este un secret al nostru,
 * dar nu o avem în cod: se completează în Project Settings → Secrets ca
 * `HOMEPITCH_PUBLIC_ANON_KEY`. Fără ea, push-ul este dezactivat, iar publicarea
 * rămâne prin feed (pull), care funcționează independent.
 */
function homepitchAnonKey(): string | null {
  return process.env["HOMEPITCH_PUBLIC_ANON_KEY"]?.trim() || null;
}

async function feedUrl(): Promise<string> {
  const { CRM_URL } = await import("@/lib/host");
  return `${CRM_URL}${HOMEPITCH_BASE_PATH}/properties`;
}

async function statusOutcome(ctx: PortalContext): Promise<PortalResult<ConnectionStatusOutcome>> {
  const url = await feedUrl();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin
    .from("portal_api_keys")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ctx.organizationId)
    .eq("portal", "homepitch")
    .is("revoked_at", null);

  const feed = await buildHomePitchFeed({
    organizationId: ctx.organizationId,
    baseUrl: (await import("@/lib/host")).CRM_URL,
    limit: 200,
  });

  const activeKeys = count ?? 0;
  const configured = activeKeys > 0;
  const detail = configured
    ? `Feed pregătit: ${feed.total} oferte valide din ${feed.selected} selectate` +
      (feed.excluded.length ? `, ${feed.excluded.length} excluse (coordonate, email agent, monedă)` : "") +
      "."
    : "Emite o cheie API Habitoo pentru HomePitch și introdu-o în HomePitch la /setari-crm.";

  return {
    ok: true,
    data: {
      configured,
      live: false,
      detail,
      feed: {
        ok: true,
        apiVersion: HOMEPITCH_API_VERSION,
        properties: feed.total,
        agents: null,
        activeKeys,
        url,
      },
    },
  };
}

type PushResult = { live: boolean; message: string; propertyUrl: string | null };

async function pushProperty(ctx: PortalContext, ref: ListingRef): Promise<PortalResult<PushResult>> {
  const baseUrl = (await import("@/lib/host")).CRM_URL;
  // Validăm exact ca la feed: dacă oferta nu e eligibilă, nu trimitem nimic.
  const feed = await buildHomePitchFeed({
    organizationId: ctx.organizationId,
    baseUrl,
    propertyId: ref.propertyId,
    limit: 1,
  });
  const excluded = feed.excluded[0];
  if (excluded) {
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      message: `Oferta nu poate fi trimisă la HomePitch: ${excluded.reasons.join(" ")}`,
      detail: excluded.reasons.join(" | "),
    };
  }
  if (!feed.properties[0]) {
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      message: "Oferta nu este bifată pentru HomePitch sau nu este publicată.",
    };
  }

  const inlineApiKey = ctx.portalCredential?.trim();
  if (!inlineApiKey) {
    return {
      ok: true,
      data: {
        live: false,
        message:
          "Oferta este vizibilă în feedul HomePitch. Pentru import instant, salvează în conexiune cheia API Habitoo emisă pentru HomePitch.",
        propertyUrl: null,
      },
    };
  }

  const anonKey = homepitchAnonKey();
  if (!anonKey || !ctx.allowLiveRequests) {
    return {
      ok: true,
      data: {
        live: false,
        message: anonKey
          ? "Oferta este vizibilă în feedul HomePitch (mod fără cereri externe)."
          : "Oferta este vizibilă în feedul HomePitch. Importul instant necesită cheia publică HomePitch (HOMEPITCH_PUBLIC_ANON_KEY).",
        propertyUrl: null,
      },
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(PUSH_ENDPOINT, {
      method: "POST",
      headers: { apikey: anonKey, "content-type": "application/json" },
      body: JSON.stringify({
        provider: "custom",
        external_id: ref.propertyId,
        inline_api_key: inlineApiKey,
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      body = {};
    }

    if (response.ok) {
      const propertyUrl = typeof body["property_url"] === "string" ? body["property_url"] : null;
      return {
        ok: true,
        data: {
          live: true,
          message: propertyUrl
            ? `HomePitch a importat oferta: ${propertyUrl}`
            : "HomePitch a importat oferta.",
          propertyUrl,
        },
      };
    }

    if (response.status === 402) {
      return {
        ok: false,
        code: "PLAN_LIMIT",
        message: "Contul HomePitch a atins limita planului: oferta nu a fost importată.",
      };
    }
    if (response.status === 403) {
      return {
        ok: false,
        code: "FORBIDDEN",
        message: "HomePitch nu recunoaște agentul ofertei (emailul agentului nu corespunde contului).",
      };
    }
    if (response.status === 404) {
      return {
        ok: false,
        code: "NOT_FOUND",
        message: "HomePitch nu a găsit oferta în feedul nostru. Verifică dacă este bifată și publicată.",
      };
    }
    if (response.status === 422) {
      const details = body["details"];
      return {
        ok: false,
        code: "VALIDATION_FAILED",
        message: "HomePitch a respins datele ofertei.",
        detail: typeof details === "string" ? details : JSON.stringify(details ?? {}),
      };
    }
    if (response.status === 401) {
      return { ok: false, code: "AUTH_FAILED", message: "Cheia API nu este acceptată de HomePitch." };
    }
    if (response.status === 429) {
      return { ok: false, code: "RATE_LIMITED", message: "HomePitch a limitat temporar cererile. Reîncearcă." };
    }
    return {
      ok: false,
      code: "PORTAL_ERROR",
      message: `HomePitch a răspuns cu eroare (${response.status}).`,
      detail: text.slice(0, 400),
    };
  } catch (error) {
    return {
      ok: false,
      code: "NETWORK_ERROR",
      message: "HomePitch nu a putut fi contactat.",
      detail: error instanceof Error ? error.message : null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function listingOutcome(
  ctx: PortalContext,
  ref: ListingRef,
): Promise<PortalResult<ListingOutcome>> {
  const result = await pushProperty(ctx, ref);
  if (!result.ok) return result;
  return {
    ok: true,
    data: {
      externalId: ref.propertyId,
      live: result.data.live,
      detail: result.data.propertyUrl ?? "feed HomePitch",
      feedVisible: true,
      message: result.data.message,
    },
  };
}

export const homepitchAdapter: PortalAdapter = {
  id: "homepitch",

  async testConnection(ctx) {
    return statusOutcome(ctx);
  },
  async getStatus(ctx) {
    return statusOutcome(ctx);
  },

  async publishListing(ctx, ref) {
    return listingOutcome(ctx, ref);
  },
  async updateListing(ctx, ref) {
    return listingOutcome(ctx, ref);
  },

  // HomePitch nu expune retragere: oferta debifată dispare din feed.
  async withdrawListing(ctx, ref): Promise<PortalResult<ListingOutcome>> {
    void ctx;
    return {
      ok: true,
      data: {
        externalId: ref.propertyId,
        live: false,
        detail: "scoasă din feedul HomePitch",
        feedVisible: false,
        message: "Oferta a fost scoasă din feed; HomePitch o arhivează la următoarea sincronizare.",
      },
    };
  },

  async sync(ctx, refs): Promise<PortalResult<{ processed: number; failed: number }>> {
    let processed = 0;
    let failed = 0;
    for (const ref of refs) {
      const result = await listingOutcome(ctx, ref);
      if (result.ok) processed += 1;
      else failed += 1;
    }
    return { ok: true, data: { processed, failed } };
  },

  async diagnoseListing(ctx, ref): Promise<PortalResult<ListingDiagnostics>> {
    const baseUrl = (await import("@/lib/host")).CRM_URL;
    const feed = await buildHomePitchFeed({
      organizationId: ctx.organizationId,
      baseUrl,
      propertyId: ref.propertyId,
      limit: 1,
    });
    const property = feed.properties[0] ?? null;
    const excluded = feed.excluded[0] ?? null;
    return {
      ok: true,
      data: {
        feedVisible: Boolean(property),
        externalId: property?.external_id ?? null,
        offerUrl: null,
        agentId: null,
        agentName: property
          ? [property.agent.first_name, property.agent.last_name].filter(Boolean).join(" ") || null
          : null,
        images: {
          total: property?.images.length ?? 0,
          resolvable: property?.images.length ?? 0,
          broken: 0,
          primary: (property?.images.length ?? 0) > 0,
        },
        updatedAt: property?.date_updated ?? null,
        notes: excluded ? excluded.reasons : feed.warnings,
      },
    };
  },
};
