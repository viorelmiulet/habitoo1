/**
 * Adaptor iMove.ro — model FEED-ONLY, conform documentației oficiale
 * https://imove.ro/docs/feeds:
 *
 *  - Habitoo expune un feed JSON, iMove îl consumă periodic;
 *  - nu există un API documentat de creare/editare/ștergere anunț pe care să-l
 *    apelăm noi, deci publicarea/actualizarea/retragerea NU sunt suportate ca
 *    operații directe: intrarea și ieșirea din feed sunt mecanismul real;
 *  - o ofertă care dispare din feed este arhivată automat de iMove.
 *
 * Adaptorul nu face niciun request extern: verifică local ce vede portalul.
 */
import type {
  ConnectionStatusOutcome,
  ListingDiagnostics,
  ListingOutcome,
  PortalAdapter,
  PortalContext,
  PortalResult,
  ListingRef,
} from "@/lib/portals/adapter";
import { notSupported } from "@/lib/portals/adapter";
import {
  IMOVE_FEED_PATH,
  IMOVE_FEED_VERSION,
  buildImoveFeed,
  imoveFeedContains,
} from "@/lib/portals/imove/feed.server";

async function feedUrl(): Promise<string> {
  const { CRM_URL } = await import("@/lib/host");
  return `${CRM_URL}${IMOVE_FEED_PATH}`;
}

async function statusOutcome(ctx: PortalContext): Promise<PortalResult<ConnectionStatusOutcome>> {
  const url = await feedUrl();
  const build = await buildImoveFeed({
    organizationId: ctx.organizationId,
    requestUrl: url,
    perPage: 500,
  });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Credențialul este EMIS DE iMOVE și salvat de utilizator; Habitoo nu emite chei.
  const { data: connection } = await supabaseAdmin
    .from("portal_connections")
    .select("portal_credentials_encrypted")
    .eq("organization_id", ctx.organizationId)
    .eq("portal", "imove")
    .maybeSingle();

  const configured = Boolean(connection?.portal_credentials_encrypted);
  const detail = configured
    ? `Feed pregătit: ${build.listings.length} oferte valide din ${build.selected} selectate` +
      (build.excluded.length ? `, ${build.excluded.length} excluse` : "") +
      "."
    : "Salvează cheia API primită de la iMove: fără ea, feedul nu poate fi citit.";

  return {
    ok: true,
    data: {
      configured,
      // Nu contactăm iMove: portalul este cel care ne citește feedul.
      live: false,
      detail,
      feed: {
        ok: true,
        apiVersion: IMOVE_FEED_VERSION,
        properties: build.listings.length,
        agents: null,
        activeKeys: configured ? 1 : 0,
        url,
      },
    },
  };
}

export const imoveAdapter: PortalAdapter = {
  id: "imove",

  async testConnection(ctx) {
    return statusOutcome(ctx);
  },

  async getStatus(ctx) {
    return statusOutcome(ctx);
  },

  // iMove nu documentează operații de scriere dinspre CRM.
  async publishListing(): Promise<PortalResult<ListingOutcome>> {
    return notSupported("publish_listing");
  },
  async updateListing(): Promise<PortalResult<ListingOutcome>> {
    return notSupported("update_listing");
  },
  async withdrawListing(): Promise<PortalResult<ListingOutcome>> {
    return notSupported("withdraw_listing");
  },
  async sync(): Promise<PortalResult<{ processed: number; failed: number }>> {
    return notSupported("sync");
  },

  async diagnoseListing(
    ctx: PortalContext,
    ref: ListingRef,
  ): Promise<PortalResult<ListingDiagnostics>> {
    const url = await feedUrl();
    const result = await imoveFeedContains({
      organizationId: ctx.organizationId,
      propertyId: ref.propertyId,
      requestUrl: url,
    });
    const listing = result.listing;
    return {
      ok: true,
      data: {
        feedVisible: result.visible,
        externalId: listing?.externalId ?? null,
        offerUrl: listing?.url ?? null,
        agentId: null,
        agentName: null,
        images: {
          total: listing?.imageUrls.length ?? 0,
          resolvable: listing?.imageUrls.length ?? 0,
          broken: 0,
          primary: (listing?.imageUrls.length ?? 0) > 0,
        },
        updatedAt: listing?.updatedAt ?? null,
        notes: result.reasons,
      },
    };
  },
};
