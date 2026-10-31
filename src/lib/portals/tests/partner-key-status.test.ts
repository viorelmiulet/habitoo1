import { describe, expect, it } from "vitest";
import { partnerKeyConnectionStatus } from "@/lib/portals/partner-key-status";
import { portalConnectionReady } from "@/lib/portals/clickimob/connection-ready";

describe("Vumsi/HomeDirect cu cheie de partener pe server", () => {
  const env = { VUMSI_API_KEY: "k", HOMEDIRECT_API_KEY: "k", HOMEDIRECT_CRM_KEY: "k" };

  it("agenție activată + cheie → ready (Conectat)", () => {
    const s = partnerKeyConnectionStatus("vumsi", true, env)!;
    expect(s).toEqual({ status: "ready", error: null });
    expect(portalConnectionReady("vumsi", { status: s.status, activated: true })).toBe(true);
  });

  it("agenție neactivată → not_configured (Cere activarea)", () => {
    const s = partnerKeyConnectionStatus("vumsi", false, env)!;
    expect(s.status).toBe("not_configured");
    expect(portalConnectionReady("vumsi", { status: s.status, activated: false })).toBe(false);
  });

  it("fără cheie → neconfigurat cu mesaj", () => {
    expect(partnerKeyConnectionStatus("vumsi", true, {})).toEqual({
      status: "not_configured",
      error: "Cheia Vumsi lipsește de pe server",
    });
    expect(partnerKeyConnectionStatus("homedirect", true, {})?.status).toBe("not_configured");
  });

  it("alte portaluri nu sunt afectate", () => {
    expect(partnerKeyConnectionStatus("storia", true, env)).toBeNull();
  });
});
