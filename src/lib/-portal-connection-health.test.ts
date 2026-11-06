import { describe, expect, it } from "vitest";
import {
  connectionsLabel,
  connectionFailureKind,
  isConnectionError,
  isPlatformConfigError,
  portalHealth,
  portalHealthLabel,
  type RecentOp,
} from "@/lib/portal-connection-health";

const ok: RecentOp = { success: true, errorCode: null, httpStatus: 200 };
const timeout: RecentOp = { success: false, errorCode: "TIMEOUT", httpStatus: null };
const conn = (over: Partial<Parameters<typeof isConnectionError>[0]> = {}) => ({
  status: "connected", lastSyncStatus: "ok", lastSyncError: null, recentOps: [] as RecentOp[], ...over,
});

describe("isConnectionError", () => {
  it("autentificare expirată → da", () => {
    expect(isConnectionError(conn({ recentOps: [{ success: false, errorCode: "AUTH_ERROR", httpStatus: 401 }] }))).toBe(true);
    expect(isConnectionError(conn({ status: "expired" }))).toBe(true);
  });
  it("reconectare necesară → da", () => {
    expect(isConnectionError(conn({ status: "needs_reauth" }))).toBe(true);
    expect(isConnectionError(conn({ lastSyncStatus: "error", lastSyncError: "Reconectează contul Storia." }))).toBe(true);
  });
  it("3 timeout-uri consecutive → da", () => {
    expect(isConnectionError(conn({ recentOps: [timeout, timeout, timeout] }))).toBe(true);
  });
  it("2 timeout-uri apoi succes → nu", () => {
    expect(isConnectionError(conn({ recentOps: [ok, timeout, timeout] }))).toBe(false);
    expect(isConnectionError(conn({ recentOps: [timeout, timeout, ok] }))).toBe(false);
  });
  it("anunț nepublicabil → nu", () => {
    expect(isConnectionError(conn({ recentOps: [{ success: false, errorCode: "VALIDATION_ERROR", httpStatus: null, errorMessage: "Oferta nu este publicabilă" }] }))).toBe(false);
  });
  it("sloturi depășite → nu", () => {
    const slot: RecentOp = { success: false, errorCode: "SLOTS_EXCEEDED", httpStatus: 403, errorMessage: "Nu mai sunt sloturi" };
    expect(isConnectionError(conn({ recentOps: [slot, slot, slot] }))).toBe(false);
    expect(isConnectionError(conn({ lastSyncStatus: "error", lastSyncError: "Limita de anunțuri din pachet a fost atinsă" }))).toBe(false);
  });
});

describe("portalHealth", () => {
  it("toate agențiile unui portal cu autentificare eșuată → „Integrarea nu funcționează”", () => {
    const states = [1, 2, 3].map(() => isConnectionError(conn({ status: "expired" })));
    const failing = states.filter(Boolean).length;
    const state = portalHealth(states.length, failing);
    expect(state).toBe("integration");
    expect(portalHealthLabel(state, failing)).toBe("Integrarea nu funcționează");
  });
  it("o parte din agenții → portocaliu, nicio eroare → Funcționează", () => {
    expect(portalHealthLabel(portalHealth(3, 1), 1)).toBe("1 agenție cu eroare de conectare");
    expect(portalHealthLabel(portalHealth(3, 0), 0)).toBe("Funcționează");
    expect(portalHealth(3, 0, true)).toBe("integration");
  });
  it("subtitlu", () => {
    expect(connectionsLabel(0)).toBe("Toate conexiunile funcționează");
    expect(connectionsLabel(2)).toBe("2 conexiuni cu eroare");
  });
});

describe("configurare platformă lipsă (SA1.2)", () => {
  const serverKey = "Cheia CRM HomeDirect nu este configurată pe server.";

  it("mesaj „nu este configurată pe server” → conexiune în eroare, motiv configurare", () => {
    const c = conn({ lastSyncStatus: "error", lastSyncError: serverKey });
    expect(isConnectionError(c)).toBe(true);
    expect(connectionFailureKind(c)).toBe("config");
    expect(isPlatformConfigError(c)).toBe(true);
  });

  it("CONFIG_ERROR la ultima operație → conexiune în eroare, motiv configurare", () => {
    const c = conn({ recentOps: [{ success: false, errorCode: "CONFIG_ERROR", httpStatus: null, errorMessage: "Integrarea nu este configurată complet." }] });
    expect(isConnectionError(c)).toBe(true);
    expect(connectionFailureKind(c)).toBe("config");
  });

  it("credențiale Ofera lipsă de pe server → motiv configurare", () => {
    const c = conn({ lastSyncStatus: "error", lastSyncError: "Credențialele Ofera nu sunt configurate pe server." });
    expect(connectionFailureKind(c)).toBe("config");
  });

  it("not_configured fără mesaj despre server → nu e eroare", () => {
    const c = conn({ status: "not_configured" });
    expect(isConnectionError(c)).toBe(false);
    expect(connectionFailureKind(c)).toBeNull();
    expect(isPlatformConfigError(c)).toBe(false);
  });

  it("cheia care lipsește ține de agenție (fără „pe server”) → nu e configurare de platformă", () => {
    const c = conn({
      lastSyncStatus: "error",
      lastSyncError: "Lipsește cheia ZonaTa a agenției.",
      recentOps: [{ success: false, errorCode: "INVALID_REQUEST", httpStatus: 422, errorMessage: "Lipsește cheia ZonaTa a agenției." }],
    });
    expect(isPlatformConfigError(c)).toBe(false);
    expect(connectionFailureKind(c)).not.toBe("config");
  });

  it("configurare lipsă → „Integrarea nu funcționează”, indiferent câte agenții are portalul", () => {
    const state = portalHealth(3, 1, false, true);
    expect(state).toBe("integration");
    expect(portalHealthLabel(state, 1)).toBe("Integrarea nu funcționează");
    expect(portalHealth(1, 1, false, true)).toBe("integration");
    expect(portalHealth(3, 1, false, false)).toBe("agencies");
  });

  it("autentificare expirată rămâne motiv de conectare, nu de configurare", () => {
    const c = conn({ status: "expired" });
    expect(connectionFailureKind(c)).toBe("connection");
    expect(isPlatformConfigError(c)).toBe(false);
    expect(portalHealthLabel(portalHealth(3, 1), 1)).toBe("1 agenție cu eroare de conectare");
  });
});
