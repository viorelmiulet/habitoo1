/**
 * Adaptor ZonaTa, pasul 1: doar „Testează conexiunea” (`GET /me`).
 * Publicarea/actualizarea/retragerea vin la pasul 3 și răspund NOT_SUPPORTED.
 */
import type { ConnectionStatusOutcome, PortalAdapter, PortalContext, PortalFail, PortalResult } from "../adapter";
import { notSupported } from "../adapter";
import type { PortalErrorCode } from "../errors";
import {
  ZONATA_BASE_URL,
  describeZonataAccount,
  getZonataAccount,
  type ZonataCallFail,
  type ZonataDeps,
} from "../zonata/client";
import { ZONATA_KEY_FORMAT_MESSAGE, isValidZonataKey, normalizeZonataKey, zonataKeyMode } from "../zonata/key";

const FAIL_CODE: Record<ZonataCallFail["kind"], PortalErrorCode> = {
  invalid_key_format: "CONFIG_ERROR",
  unauthorized: "AUTH_ERROR",
  package_required: "AUTH_ERROR",
  email_unverified: "AUTH_ERROR",
  not_found: "NOT_FOUND",
  validation: "VALIDATION_ERROR",
  rate_limited: "RATE_LIMIT",
  client_error: "INVALID_REQUEST",
  server_error: "PORTAL_ERROR",
  timeout: "TIMEOUT",
  network_error: "NETWORK_ERROR",
  blocked_redirect: "CONFIG_ERROR",
};

export function zonataToPortalFail(failure: ZonataCallFail): PortalFail {
  return {
    ok: false,
    code: FAIL_CODE[failure.kind],
    message: failure.message,
    detail: `zonata_kind=${failure.kind}${failure.code ? ` code=${failure.code}` : ""}`,
    httpStatus: failure.status,
    portalResponse: failure.body,
    retryAfterMs: failure.retryAfterMs,
  };
}

function apiKeyOf(ctx: PortalContext): string | PortalFail {
  const key = normalizeZonataKey(ctx.portalCredential);
  if (!key) return { ok: false, code: "CONFIG_ERROR", message: "Lipsește cheia ZonaTa a agenției.", detail: null, httpStatus: null };
  if (!isValidZonataKey(key)) return { ok: false, code: "CONFIG_ERROR", message: ZONATA_KEY_FORMAT_MESSAGE, detail: null, httpStatus: null };
  return key;
}

export function createZonataAdapter(deps: ZonataDeps = {}): PortalAdapter {
  return {
    id: "zonata",
    async testConnection(ctx): Promise<PortalResult<ConnectionStatusOutcome>> {
      const key = apiKeyOf(ctx);
      if (typeof key !== "string") return key;
      const result = await getZonataAccount(key, deps);
      if (!result.ok) return zonataToPortalFail(result);
      return {
        ok: true,
        data: { configured: true, live: true, detail: describeZonataAccount(result.data, zonataKeyMode(key)), portalResponse: result.data },
      };
    },
    async getStatus(ctx): Promise<PortalResult<ConnectionStatusOutcome>> {
      const key = apiKeyOf(ctx);
      if (typeof key !== "string") return { ok: true, data: { configured: false, live: false, detail: key.message } };
      return { ok: true, data: { configured: true, live: ctx.allowLiveRequests, detail: `zonata base=${ZONATA_BASE_URL} mode=${zonataKeyMode(key)}` } };
    },
    async publishListing() {
      return notSupported("publish_listing");
    },
    async updateListing() {
      return notSupported("update_listing");
    },
    async withdrawListing() {
      return notSupported("withdraw_listing");
    },
    async sync() {
      return notSupported("sync");
    },
  };
}

export const zonataAdapter = createZonataAdapter();
