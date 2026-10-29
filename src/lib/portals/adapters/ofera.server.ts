import { notSupported, type PortalAdapter, type PortalContext, type PortalFail } from "../adapter";
import { OFERA_MISSING_MESSAGE, oferaConfigured, oferaProviderId, OFERA_SECRET_NAMES } from "../ofera/config";
import { oferaRequest } from "../ofera/client.server";
import { getOferaToken, type OferaAuthDeps } from "../ofera/auth.server";
import { oferaRedact, type OferaResponse } from "../ofera/response";
const failure = (result: OferaResponse): PortalFail => ({ ok: false, code: result.status === 401 ? "AUTH_ERROR" : "PORTAL_ERROR", message: result.message, httpStatus: null, portalResponse: result });
export function createOferaAdapter(injected?: OferaAuthDeps): PortalAdapter {
  const env = () => injected?.env ?? process.env;
  const missing = () => !oferaConfigured(env());
  const dependencies = async (ctx: PortalContext): Promise<OferaAuthDeps> => injected ?? { env: process.env, ...await (await import("../ofera/store.server")).createOferaStore(ctx.organizationId) };
  return {
    id: "ofera",
    async getStatus() {
      return { ok: true, data: { configured: !missing(), live: false, detail: missing() ? OFERA_MISSING_MESSAGE : "Credențialele Ofera sunt configurate. Testează conexiunea." } };
    },
    async testConnection(ctx) {
      if (missing()) return { ok: false, code: "CONFIG_ERROR", message: OFERA_MISSING_MESSAGE };
      try {
        const deps = await dependencies(ctx);
        const response = await oferaRequest("GET", "/categories", deps);
        if (!response.ok) return failure(response);
        const token = await getOferaToken(deps);
        const scope = oferaRedact(JSON.stringify(token.scope || "nespecificat"), [...OFERA_SECRET_NAMES.map((name) => env()[name] ?? ""), token.token]).slice(1, -1);
        return { ok: true, data: { configured: true, live: true, detail: `Conectat · Scopuri Ofera: ${scope} · ID furnizor agenție: ${oferaProviderId(ctx.settings["id_furnizor"]) === null ? "necompletat" : "completat"}.${response.logTrackId ? ` Referință Ofera: ${response.logTrackId}.` : ""}`, portalResponse: response } };
      } catch { return { ok: false, code: "CONFIG_ERROR", message: "Conexiunea Ofera nu a putut fi verificată sau jurnalizată." }; }
    },
    async publishListing() { return notSupported("publish_listing"); },
    async updateListing() { return notSupported("update_listing"); },
    async withdrawListing() { return notSupported("withdraw_listing"); },
    async sync() { return notSupported("sync"); },
  };
}
export const oferaAdapter = createOferaAdapter();