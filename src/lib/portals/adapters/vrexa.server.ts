/** Adaptor Vrexa.ro: deocamdată doar testul de conexiune (fără publicare). */
import { notSupported as baseNotSupported, type PortalAdapter, type PortalContext, type PortalResult, type PortalFail, type ConnectionStatusOutcome } from "../adapter";
import { vrexaBaseUrl, vrexaConnectionEnv, vrexaEnvLabel, VREXA_NO_PRODUCTION_URL } from "../vrexa/config";
import { vrexaRequest, type VrexaCredentials, type VrexaTransport } from "../vrexa/client";

type Fail = PortalFail;
const notSupported = (op: string): Fail => baseNotSupported(op);

export function vrexaCredentials(ctx: PortalContext, env: Record<string, string | undefined>): VrexaCredentials | Fail {
  const mode = vrexaConnectionEnv(ctx.settings, env);
  const baseUrl = vrexaBaseUrl(mode, env);
  if (!baseUrl) return { ok: false, code: "CONFIG_ERROR", message: VREXA_NO_PRODUCTION_URL, detail: "vrexa_no_production_url", httpStatus: null };
  const clientId = (ctx.externalAccountId ?? "").trim();
  const clientSecret = (ctx.portalCredential ?? "").trim();
  if (!clientId || !clientSecret) return { ok: false, code: "CONFIG_ERROR", message: "Lipsesc client id sau client secret Vrexa ale agenției.", detail: "vrexa_no_credentials", httpStatus: null };
  return { organizationId: ctx.organizationId, env: mode, baseUrl, clientId, clientSecret };
}

export function createVrexaAdapter(opts: { transport?: VrexaTransport; env?: () => Record<string, string | undefined> } = {}): PortalAdapter {
  const env = opts.env ?? (() => process.env);
  return {
    id: "vrexa",
    async testConnection(ctx): Promise<PortalResult<ConnectionStatusOutcome>> {
      const c = vrexaCredentials(ctx, env());
      if ("ok" in c) return c;
      if (!ctx.allowLiveRequests) return { ok: true, data: { configured: true, live: false, detail: `vrexa_dry_run env=${c.env}` } };
      const r = await vrexaRequest<{ totalCount?: number }>(c, "GET", "/partner/v1/listings?pageSize=1", undefined, opts.transport ? { transport: opts.transport } : {});
      if (!r.ok) {
        return { ok: false, code: r.kind === "auth" || r.kind === "agency_inactive" ? "AUTH_ERROR" : r.kind === "rate_limited" ? "RATE_LIMIT" : "PORTAL_ERROR", message: r.message, detail: `vrexa_kind=${r.kind} code=${r.problem.code ?? "-"}`, httpStatus: r.status, ...(r.retryAt ? { detail: `vrexa_kind=${r.kind} retry_at=${r.retryAt}` } : {}) };
      }
      const total = typeof r.data?.totalCount === "number" ? r.data.totalCount : 0;
      return { ok: true, data: { configured: true, live: true, detail: `Conectat la Vrexa (${vrexaEnvLabel(c.env)}). Anunțuri prin API: ${total}.` } };
    },
    async getStatus(ctx) {
      const c = vrexaCredentials(ctx, env());
      return { ok: true, data: { configured: !("ok" in c), live: false, detail: "ok" in c ? c.message : `vrexa configured env=${c.env}` } };
    },
    publishListing: async () => notSupported("publicarea"),
    updateListing: async () => notSupported("actualizarea"),
    withdrawListing: async () => notSupported("retragerea"),
    sync: async () => notSupported("sincronizarea"),
  };
}

export const vrexaAdapter = createVrexaAdapter();
