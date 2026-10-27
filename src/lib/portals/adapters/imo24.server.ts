/**
 * Adaptor imo24.ro — pasul 1: doar conexiunea (cheie + `GET /me`).
 * Publicarea, imaginile, creditele și promovarea nu sunt implementate încă:
 * operațiile respective întorc NOT_SUPPORTED, fără niciun apel la portal.
 */
import type { ConnectionStatusOutcome, PortalAdapter, PortalContext, PortalFail, PortalResult } from "../adapter";
import { notSupported } from "../adapter";
import type { PortalErrorCode } from "../errors";
import { IMO24_BASE_URL, describeImo24Account, getImo24Account, type Imo24CallFail, type Imo24Deps } from "../imo24/client";
import { IMO24_KEY_FORMAT_MESSAGE, isValidImo24Key, normalizeImo24Key } from "../imo24/key";

const FAIL_CODE: Record<Imo24CallFail["kind"], PortalErrorCode> = {
  invalid_key_format: "CONFIG_ERROR",
  unauthorized: "AUTH_ERROR",
  auth_cooldown: "AUTH_ERROR",
  forbidden_scope: "AUTH_ERROR",
  rate_limited: "RATE_LIMIT",
  package_limit: "INVALID_REQUEST",
  package_inactive: "INVALID_REQUEST",
  duplicate: "INVALID_REQUEST",
  immutable_field: "INVALID_REQUEST",
  validation: "INVALID_REQUEST",
  not_found: "NOT_FOUND",
  client_error: "INVALID_REQUEST",
  server_error: "PORTAL_ERROR",
  timeout: "TIMEOUT",
  network_error: "NETWORK_ERROR",
  blocked_redirect: "CONFIG_ERROR",
};

export function imo24ToPortalFail(failure: Imo24CallFail): PortalFail {
  return {
    ok: false,
    code: FAIL_CODE[failure.kind],
    message: failure.message,
    detail: `imo24_kind=${failure.kind}${failure.code ? ` code=${failure.code}` : ""}${failure.requestId ? ` request_id=${failure.requestId}` : ""}`,
    httpStatus: failure.status,
    portalResponse: failure.body,
    retryAfterMs: failure.retryAfterMs,
  };
}

function apiKeyOf(ctx: PortalContext): string | PortalFail {
  const key = normalizeImo24Key(ctx.portalCredential);
  if (!key) {
    return { ok: false, code: "CONFIG_ERROR", message: "Lipsește cheia imo24.ro a agenției.", detail: null, httpStatus: null };
  }
  if (!isValidImo24Key(key)) {
    return { ok: false, code: "CONFIG_ERROR", message: IMO24_KEY_FORMAT_MESSAGE, detail: null, httpStatus: null };
  }
  return key;
}

export function createImo24Adapter(deps: Imo24Deps = {}): PortalAdapter {
  return {
    async testConnection(ctx): Promise<PortalResult<ConnectionStatusOutcome>> {
      const key = apiKeyOf(ctx);
      if (typeof key !== "string") return key;
      if (!ctx.allowLiveRequests) {
        return { ok: true, data: { configured: true, live: false, detail: "imo24_dry_run action=test_connection" } };
      }
      const result = await getImo24Account(key, deps);
      if (!result.ok) return imo24ToPortalFail(result);
      const { ok, summary } = describeImo24Account(result.data);
      if (!ok) {
        return { ok: false, code: "AUTH_ERROR", message: summary, detail: "imo24_scope_missing=scriere", httpStatus: result.status };
      }
      return { ok: true, data: { configured: true, live: true, detail: summary } };
    },

    async getStatus(ctx): Promise<PortalResult<ConnectionStatusOutcome>> {
      const key = apiKeyOf(ctx);
      if (typeof key !== "string") return { ok: true, data: { configured: false, live: false, detail: key.message } };
      return { ok: true, data: { configured: true, live: ctx.allowLiveRequests, detail: `imo24 base=${IMO24_BASE_URL}` } };
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

export const imo24Adapter = createImo24Adapter();
