/**
 * Adaptor Vumsi.com (etapa 1): doar testul conexiunii (`GET /me/`) cu cheia de partener globală.
 * Publicarea/actualizarea/retragerea vin în etapele următoare; până atunci întorc NOT_SUPPORTED
 * fără niciun apel la Vumsi.
 */
import type { ConnectionStatusOutcome, PortalAdapter, PortalResult } from "../adapter";
import { notSupported } from "../adapter";
import type { PortalErrorCode } from "../errors";
import { describeVumsiMe, getVumsiMe, type VumsiCallFail, type VumsiDeps } from "../vumsi/client.server";
import { VUMSI_KEY_MISSING_MESSAGE, hasVumsiKey } from "../vumsi/config";

const FAIL_CODE: Record<VumsiCallFail["kind"], PortalErrorCode> = {
  not_configured: "CONFIG_ERROR",
  validation: "VALIDATION_ERROR",
  unauthorized: "AUTH_ERROR",
  forbidden: "AUTH_ERROR",
  not_found: "NOT_FOUND",
  rate_limited: "RATE_LIMIT",
  client_error: "INVALID_REQUEST",
  server_error: "PORTAL_ERROR",
  timeout: "TIMEOUT",
  network_error: "NETWORK_ERROR",
  blocked_redirect: "CONFIG_ERROR",
};

export function createVumsiAdapter(deps: VumsiDeps = {}): PortalAdapter {
  const env = () => deps.env ?? process.env;
  async function test(): Promise<PortalResult<ConnectionStatusOutcome>> {
    if (!hasVumsiKey(env())) return { ok: true, data: { configured: false, live: false, detail: VUMSI_KEY_MISSING_MESSAGE } };
    const r = await getVumsiMe(deps);
    if (!r.ok) return { ok: false, code: FAIL_CODE[r.kind], message: r.message, detail: `vumsi_kind=${r.kind}`, httpStatus: r.status, portalResponse: r.body, retryAfterMs: r.retryAfterMs };
    return { ok: true, data: { configured: true, live: true, detail: describeVumsiMe(r.data), portalResponse: r.data } };
  }
  return {
    id: "vumsi",
    testConnection: test,
    getStatus: test,
    publishListing: async () => notSupported("publish_listing"),
    updateListing: async () => notSupported("update_listing"),
    withdrawListing: async () => notSupported("withdraw_listing"),
    sync: async () => notSupported("sync"),
  };
}

export const vumsiAdapter = createVumsiAdapter();
