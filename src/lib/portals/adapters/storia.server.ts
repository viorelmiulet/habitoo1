/**
 * Adaptor Storia.ro (OLX Group RE API) — FAZA 1: doar conexiunea OAuth2.
 *
 * Publicarea, taxonomia și webhook-urile vin în fazele următoare; până atunci
 * adaptorul NU declară operații pe care nu le poate executa: `publishListing`,
 * `updateListing`, `withdrawListing` și `sync` returnează `NOT_SUPPORTED`.
 *
 * Autentificarea este per agenție, cu `access_token`/`refresh_token` obținute
 * prin fluxul OAuth (vezi `../storia/oauth.server.ts`). Aici nu se citește
 * niciun secret direct și nu se loghează niciodată tokenul.
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
import { PortalError, codeFromHttpStatus, toPortalError } from "../errors";
import { loadStoriaTokens, olxAuthorizedRequest, readStoriaOAuthMeta, storiaAppConfigured } from "../storia/oauth.server";

/** Endpoint minim, folosit doar ca să confirmăm că tokenul este acceptat. */
const PROBE_PATH = "/advert/v1/adverts?limit=1";

function connectedState(ctx: PortalContext): { hasTokens: boolean; expiresAt: string | null } {
  const meta = readStoriaOAuthMeta(ctx.settings);
  return { hasTokens: Boolean(ctx.portalCredential), expiresAt: meta?.expires_at ?? null };
}

async function probe(ctx: PortalContext): Promise<PortalResult<ConnectionStatusOutcome>> {
  if (!storiaAppConfigured()) {
    return {
      ok: false,
      code: "CONFIG_ERROR",
      message:
        "Integrarea Storia nu este configurată la nivel de platformă: lipsesc credențialele de aplicație OLX.",
      detail: "missing_app_credentials",
    };
  }

  const tokens = await loadStoriaTokens(ctx.organizationId);
  if (!tokens) {
    return {
      ok: false,
      code: "AUTH_ERROR",
      message: "Contul Storia al agenției nu este conectat. Pornește autorizarea contului Storia.",
      detail: "not_connected",
    };
  }

  if (!ctx.allowLiveRequests) {
    return {
      ok: true,
      data: {
        configured: true,
        live: false,
        detail: "storia oauth configurat; trimiterile reale sunt oprite (mod simulare)",
      },
    };
  }

  try {
    const res = await olxAuthorizedRequest(ctx.organizationId, "GET", PROBE_PATH);
    // Orice răspuns care nu este 401/403 confirmă că tokenul agenției e acceptat.
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        code: "AUTH_ERROR",
        message: "Storia a refuzat tokenul agenției. Reia conectarea contului Storia.",
        detail: `probe_http_${res.status}`,
      };
    }
    if (res.status >= 500) {
      return {
        ok: false,
        code: codeFromHttpStatus(res.status),
        message: "Storia nu a răspuns corect. Reîncearcă în câteva minute.",
        detail: `probe_http_${res.status}`,
      };
    }
    return {
      ok: true,
      data: {
        configured: true,
        live: true,
        detail: `storia oauth valid (http_${res.status})`,
      },
    };
  } catch (error) {
    const portalError = error instanceof PortalError ? error : toPortalError(error);
    return {
      ok: false,
      code: portalError.code,
      message: portalError.message,
      detail: portalError.detail,
    };
  }
}

export const storiaAdapter: PortalAdapter = {
  id: "storia",

  async testConnection(ctx) {
    return probe(ctx);
  },

  async getStatus(ctx) {
    const state = connectedState(ctx);
    if (!state.hasTokens) {
      return {
        ok: true,
        data: { configured: false, live: false, detail: "storia: cont neconectat" },
      };
    }
    const expired = state.expiresAt ? new Date(state.expiresAt).getTime() <= Date.now() : false;
    return {
      ok: true,
      data: {
        configured: true,
        live: false,
        detail: expired
          ? "storia: token expirat, se reîmprospătează automat la prima cerere"
          : "storia: cont conectat",
      },
    };
  },

  async publishListing(_ctx: PortalContext, _ref: ListingRef): Promise<PortalResult<ListingOutcome>> {
    return notSupported("publishListing");
  },

  async updateListing(_ctx: PortalContext, _ref: ListingRef): Promise<PortalResult<ListingOutcome>> {
    return notSupported("updateListing");
  },

  async withdrawListing(_ctx: PortalContext, _ref: ListingRef): Promise<PortalResult<ListingOutcome>> {
    return notSupported("withdrawListing");
  },

  async sync(): Promise<PortalResult<{ processed: number; failed: number }>> {
    return notSupported("sync");
  },
};
