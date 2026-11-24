/**
 * Adaptor HomeZZ.ro + Lajumate.ro: deocamdată doar test conexiune
 * (`details-agency` cu `key`). Fără publicare, agenți sau mapper.
 */
import type { ConnectionStatusOutcome, PortalAdapter, PortalContext, PortalFail, PortalResult } from "../adapter";
import { notSupported } from "../adapter";
import type { PortalErrorCode } from "../errors";
import { describeHomezzAgency, homezzPost, type HomezzFailKind, type HomezzTransport } from "../homezz/client";
import { relayFetch } from "../relay.server";

const FAIL_CODE: Record<HomezzFailKind, PortalErrorCode> = {
  action_error: "INVALID_REQUEST",
  forbidden: "AUTH_ERROR",
  redirect: "CONFIG_ERROR",
  server_error: "PORTAL_ERROR",
  http_error: "PORTAL_ERROR",
  invalid_response: "PORTAL_ERROR",
  timeout: "TIMEOUT",
  network_error: "NETWORK_ERROR",
};

export const homezzRelayTransport: HomezzTransport = (url, init) => relayFetch("homezz", url, init);

export function createHomezzAdapter(transport: HomezzTransport = homezzRelayTransport): PortalAdapter {
  const keyOf = (ctx: PortalContext): string | PortalFail => {
    const key = (ctx.portalCredential ?? "").trim();
    return key || { ok: false, code: "CONFIG_ERROR", message: "Lipsește cheia API HomeZZ.ro a agenției.", detail: null, httpStatus: null };
  };
  return {
    id: "homezz",
    async testConnection(ctx): Promise<PortalResult<ConnectionStatusOutcome>> {
      const key = keyOf(ctx);
      if (typeof key !== "string") return key;
      if (!ctx.allowLiveRequests) return { ok: true, data: { configured: true, live: false, detail: "homezz_dry_run action=details-agency" } };
      const result = await homezzPost("details-agency", { key }, transport);
      const portalResponse = { action: "details-agency", http_status: result.status, body: result.raw };
      if (!result.ok) {
        return { ok: false, code: FAIL_CODE[result.kind], message: result.message, detail: `homezz_kind=${result.kind}`, httpStatus: result.status, portalResponse };
      }
      return { ok: true, data: { configured: true, live: true, detail: describeHomezzAgency(result.data), portalResponse } };
    },
    async getStatus(ctx) {
      const key = keyOf(ctx);
      return { ok: true, data: { configured: typeof key === "string", live: false, detail: typeof key === "string" ? "homezz configured" : key.message } };
    },
    async publishListing() { return notSupported("publish_listing"); },
    async updateListing() { return notSupported("update_listing"); },
    async withdrawListing() { return notSupported("withdraw_listing"); },
    async sync() { return notSupported("sync"); },
  };
}

export const homezzAdapter = createHomezzAdapter();
