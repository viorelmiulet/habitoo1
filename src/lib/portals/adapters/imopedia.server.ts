/**
 * Adaptor Imopedia.ro — etapa 1: doar „Testează conexiunea”
 * (login → viewAgency → logout în finally). Publicarea și media vin ulterior.
 */
import type { ConnectionStatusOutcome, PortalAdapter, PortalContext, PortalFail, PortalResult } from "../adapter";
import { notSupported } from "../adapter";
import {
  ImopediaSoapError,
  imopediaLogin,
  imopediaLogout,
  imopediaViewAgency,
  redactSoapXml,
  type ImopediaClientDeps,
  type ImopediaRawLog,
} from "../imopedia/soap.server";
import { parseImopediaAgencyId } from "../imopedia/config";

function fail(code: PortalFail["code"], message: string, extra: Partial<PortalFail> = {}): PortalFail {
  return { ok: false, code, message, detail: null, httpStatus: null, ...extra };
}

function boostSummary(raw: Record<string, unknown>): string | null {
  const find = (obj: unknown, key: string, depth = 0): unknown => {
    if (!obj || typeof obj !== "object" || depth > 4) return undefined;
    const rec = obj as Record<string, unknown>;
    if (key in rec) return rec[key];
    for (const v of Object.values(rec)) {
      const found = find(v, key, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  const parts = [
    ["boostAvailable", "disponibile"],
    ["boostAllocated", "alocate"],
    ["boostConsumed", "consumate"],
  ]
    .map(([k, label]) => {
      const v = find(raw, k!);
      return v === undefined || v === null || v === "" ? null : `${label} ${String(v)}`;
    })
    .filter(Boolean);
  return parts.length ? `Boost: ${parts.join(", ")}` : null;
}

export function createImopediaAdapter(deps: ImopediaClientDeps = {}): PortalAdapter {
  return {
    id: "imopedia",

    async testConnection(ctx: PortalContext): Promise<PortalResult<ConnectionStatusOutcome>> {
      const username = (ctx.externalAccountId ?? "").trim();
      const password = ctx.portalCredential ?? "";
      const agencyId = parseImopediaAgencyId(ctx.settings["agency_id"]);
      if (!username || !password) return fail("CONFIG_ERROR", "Lipsesc utilizatorul sau parola API Imopedia.");
      if (agencyId === null) return fail("CONFIG_ERROR", "ID-ul agenției Imopedia (AGENTIA) trebuie să fie un număr întreg ≥ 1.");
      if (!ctx.allowLiveRequests) {
        return { ok: true, data: { configured: true, live: false, detail: "imopedia_dry_run action=test_connection" } };
      }

      const logs: ImopediaRawLog[] = [];
      let sessionId: string | null = null;
      const tracked: ImopediaClientDeps = { ...deps, onResponse: (e) => { logs.push(e); deps.onResponse?.(e); } };
      const rawLog = () =>
        logs.map((l) => ({ operation: l.operation, http_status: l.status, xml: redactSoapXml(l.xml, [password, sessionId]) }));
      try {
        try {
          sessionId = await imopediaLogin(username, password, tracked);
        } catch (error) {
          if (error instanceof ImopediaSoapError && error.code === "SOAP_FAULT") {
            return fail("AUTH_ERROR", "Utilizator sau parolă Imopedia greșite", { portalResponse: { responses: rawLog() }, detail: "imopedia_login_fault" });
          }
          throw error;
        }
        const result = await imopediaViewAgency(sessionId, agencyId, tracked);
        if (!result.isValid) {
          const msg = result.errors.join("; ") || "Imopedia a respins verificarea agenției (AGENTIA nu aparține acestui cont?).";
          return fail("AUTH_ERROR", msg, { portalResponse: { responses: rawLog() }, detail: "imopedia_view_agency_invalid" });
        }
        const boost = boostSummary(result.raw);
        return {
          ok: true,
          data: {
            configured: true,
            live: true,
            detail: boost ? `Conectat la Imopedia.ro. ${boost}.` : "Conectat la Imopedia.ro.",
            portalResponse: { responses: rawLog() },
          },
        };
      } catch (error) {
        const e = error instanceof ImopediaSoapError ? error : null;
        const code: PortalFail["code"] =
          e?.code === "TIMEOUT" ? "TIMEOUT" : e?.code === "NETWORK_ERROR" ? "NETWORK_ERROR" : "PORTAL_ERROR";
        const message = (e?.message ?? "Testul conexiunii Imopedia a eșuat.").split(password).join("[redacted]");
        return fail(code, message, { httpStatus: e?.httpStatus ?? null, portalResponse: { responses: rawLog() } });
      } finally {
        if (sessionId) await imopediaLogout(sessionId, tracked).catch(() => undefined);
      }
    },

    async getStatus(ctx) {
      const configured =
        Boolean(ctx.externalAccountId && ctx.portalCredential) && parseImopediaAgencyId(ctx.settings["agency_id"]) !== null;
      return { ok: true, data: { configured, live: configured && ctx.allowLiveRequests, detail: "imopedia soap2" } };
    },
    async publishListing() { return notSupported("publish_listing"); },
    async updateListing() { return notSupported("update_listing"); },
    async withdrawListing() { return notSupported("withdraw_listing"); },
    async sync() { return notSupported("sync"); },
  };
}

export const imopediaAdapter = createImopediaAdapter();
