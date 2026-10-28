/**
 * Adaptor HomeDirect.ro, pasul 1: doar „Testează conexiunea” (`GET /stats`).
 * Cheia CRM e globală (secretul HOMEDIRECT_CRM_API_KEY), deci testul nu depinde de agenție.
 * Publicarea vine în etapele următoare și răspunde NOT_SUPPORTED.
 */
import type { ConnectionStatusOutcome, PortalAdapter, PortalFail, PortalResult } from "../adapter";
import { notSupported } from "../adapter";
import type { PortalErrorCode } from "../errors";
import { describeHomedirectStats, getHomedirectStats, type HomedirectCallFail, type HomedirectDeps } from "../homedirect/client.server";
import { HOMEDIRECT_KEY_MISSING_MESSAGE, hasHomedirectKey, resolveHomedirectBaseUrl } from "../homedirect/config";

const FAIL_CODE: Record<HomedirectCallFail["kind"], PortalErrorCode> = {
  not_configured: "CONFIG_ERROR",
  invalid_base_url: "CONFIG_ERROR",
  validation: "VALIDATION_ERROR",
  unauthorized: "AUTH_ERROR",
  forbidden: "AUTH_ERROR",
  not_found: "NOT_FOUND",
  duplicate: "INVALID_REQUEST",
  rate_limited: "RATE_LIMIT",
  client_error: "INVALID_REQUEST",
  server_error: "PORTAL_ERROR",
  timeout: "TIMEOUT",
  network_error: "NETWORK_ERROR",
  blocked_redirect: "CONFIG_ERROR",
};

export function homedirectToPortalFail(f: HomedirectCallFail): PortalFail {
  return { ok: false, code: FAIL_CODE[f.kind], message: f.message, detail: `homedirect_kind=${f.kind}`, httpStatus: f.status, portalResponse: f.body, retryAfterMs: f.retryAfterMs };
}

export function createHomedirectAdapter(deps: HomedirectDeps = {}): PortalAdapter {
  const env = () => deps.env ?? process.env;
  return {
    id: "homedirect",
    async testConnection(): Promise<PortalResult<ConnectionStatusOutcome>> {
      const result = await getHomedirectStats(deps);
      if (!result.ok) return homedirectToPortalFail(result);
      return { ok: true, data: { configured: true, live: true, detail: describeHomedirectStats(result.data, result.environment), portalResponse: result.data } };
    },
    async getStatus(): Promise<PortalResult<ConnectionStatusOutcome>> {
      if (!hasHomedirectKey(env())) return { ok: true, data: { configured: false, live: false, detail: HOMEDIRECT_KEY_MISSING_MESSAGE } };
      const base = resolveHomedirectBaseUrl(env()["HOMEDIRECT_API_BASE_URL"]);
      if (!base.ok) return { ok: true, data: { configured: false, live: false, detail: base.message } };
      return { ok: true, data: { configured: true, live: true, detail: `homedirect env=${base.environment}` } };
    },
    async publishListing() { return notSupported("publish_listing"); },
    async updateListing() { return notSupported("update_listing"); },
    async withdrawListing() { return notSupported("withdraw_listing"); },
    async sync() { return notSupported("sync"); },
  };
}

export const homedirectAdapter = createHomedirectAdapter();
