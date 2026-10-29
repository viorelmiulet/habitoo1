import { notSupported, type PortalAdapter } from "../adapter";
import { zupConfigured, ZUP_MISSING_MESSAGE } from "../zup/config";
import { PortalError } from "../errors";
export const zupAdapter: PortalAdapter = {
  id: "zup",
  async getStatus() { return { ok: true, data: { configured: zupConfigured(process.env), live: false, detail: zupConfigured(process.env) ? "Conectează contul ZUP." : ZUP_MISSING_MESSAGE } }; },
  async testConnection(ctx) {
    try {
      const { zupDependencies } = await import("../zup/store.server");
      const { testZupConnection } = await import("../zup/oauth.server");
      const r = await testZupConnection(ctx.organizationId, await zupDependencies());
      return { ok: true, data: { configured: true, live: true, detail: r.message } };
    } catch (e) { return { ok: false, code: e instanceof PortalError ? e.code : "PORTAL_ERROR", message: e instanceof PortalError ? e.message : "Conexiunea ZUP nu a putut fi verificată." }; }
  },
  async publishListing() { return notSupported("ZUP: publicarea vine în etapa 3"); },
  async updateListing() { return notSupported("ZUP: publicarea vine în etapa 3"); },
  async withdrawListing() { return notSupported("ZUP: publicarea vine în etapa 3"); },
  async sync() { return notSupported("ZUP: sincronizarea nu este disponibilă în etapa 1"); },
};