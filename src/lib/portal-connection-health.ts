/**
 * SuperAdmin: o conexiune de portal „nu funcționează” când e problemă de
 * conectare (autentificare respinsă/expirată, reconectare necesară, cont
 * suspendat, portalul nu răspunde de 3 ori la rând) sau de configurare a
 * platformei Habitoo (o cheie/secret lipsește de pe server ori ultima operație
 * a eșuat cu CONFIG_ERROR). Anunțurile incomplete, validările, sloturile și
 * promovările NU sunt erori de conectare.
 * Reguli pure; datele vin din `portal_connections` și ultimele operații.
 */
import { classifyPortalErrorCode } from "@/lib/portal-error-class";

export const NO_RESPONSE_STREAK = 3;

export type RecentOp = { success: boolean; errorCode: string | null; httpStatus: number | null; errorMessage?: string | null };

export type ConnectionHealthInput = {
  status: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  /** Cele mai noi primele. */
  recentOps: RecentOp[];
};

/** Motivul pentru care conexiunea nu funcționează. */
export type ConnectionFailureKind = "config" | "connection";

const BROKEN_STATUSES = new Set(["error", "expired", "needs_reauth", "reauth_required", "reconnect_required", "suspended", "disabled", "revoked", "unauthorized"]);
const AUTH_CODES = new Set(["AUTH_ERROR", "UNAUTHORIZED", "TOKEN_EXPIRED", "REAUTH_REQUIRED", "ACCOUNT_SUSPENDED", "ACCOUNT_DISABLED"]);
const NO_RESPONSE_CODES = new Set(["TIMEOUT", "PORTAL_ERROR", "NETWORK_ERROR", "UNAVAILABLE"]);
const AUTH_MESSAGE = /autentific|autoriz|expirat|reconect|token|suspendat|dezactivat|cheia|unauthori[sz]ed|forbidden/i;

/** Codul care spune că lipsesc piesele configurării integrării. */
const CONFIG_CODES = new Set(["CONFIG_ERROR"]);

/** Textul din cardul „De rezolvat” pentru o conexiune fără configurare pe server. */
export const SERVER_CONFIG_LABEL = "configurare lipsă pe server";

/**
 * Mesaj care spune că o cheie/un secret Habitoo nu este configurat pe server
 * (ex. „Cheia CRM HomeDirect nu este configurată pe server.”). Cere ambele
 * jumătăți: „pe server” și un cuvânt de configurare, ca să nu se numere o
 * agenție care își completase încă datele.
 */
function isServerConfigMessage(message: string | null | undefined): boolean {
  if (!message) return false;
  return /\bpe server\b/i.test(message) && /configurat|secret|cheie|creden[țt]ial/i.test(message);
}

function isAuthFailure(op: RecentOp): boolean {
  if (op.success) return false;
  if (op.errorCode && AUTH_CODES.has(op.errorCode)) return true;
  return op.httpStatus === 401;
}

function isNoResponse(op: RecentOp): boolean {
  if (op.success) return false;
  if (classifyPortalErrorCode(op.errorCode, op.errorMessage) !== "platform") return false;
  if (op.errorCode && NO_RESPONSE_CODES.has(op.errorCode)) return true;
  if (op.errorCode?.startsWith("olx_internal")) return true;
  return op.httpStatus != null && op.httpStatus >= 500;
}

/**
 * Problemă a platformei Habitoo, nu a agenției: configurarea lipsește de pe
 * server. `status: "not_configured"` singur NU înseamnă eroare — poate fi
 * agenția care nu și-a completat datele; contează doar mesajul despre server
 * (păstrat în `last_sync_error`, chiar fără `last_sync_status`) sau
 * `CONFIG_ERROR` la ultima operație.
 */
export function isPlatformConfigError(c: ConnectionHealthInput): boolean {
  if (isServerConfigMessage(c.lastSyncError)) return true;
  const latest = c.recentOps[0];
  if (!latest || latest.success) return false;
  if (latest.errorCode && CONFIG_CODES.has(latest.errorCode)) return true;
  return isServerConfigMessage(latest.errorMessage);
}

function isConnectionFailure(c: ConnectionHealthInput): boolean {
  if (c.status && BROKEN_STATUSES.has(c.status)) return true;
  if (c.lastSyncStatus === "error" && c.lastSyncError) {
    const cls = classifyPortalErrorCode(null, c.lastSyncError);
    if (cls === "platform" && AUTH_MESSAGE.test(c.lastSyncError)) return true;
  }
  const latest = c.recentOps[0];
  if (latest && isAuthFailure(latest)) return true;
  const streak = c.recentOps.slice(0, NO_RESPONSE_STREAK);
  return streak.length === NO_RESPONSE_STREAK && streak.every(isNoResponse);
}

/** De ce nu funcționează conexiunea: configurarea platformei înainte de conectare. */
export function connectionFailureKind(c: ConnectionHealthInput): ConnectionFailureKind | null {
  if (isPlatformConfigError(c)) return "config";
  if (isConnectionFailure(c)) return "connection";
  return null;
}

export function isConnectionError(c: ConnectionHealthInput): boolean {
  return connectionFailureKind(c) !== null;
}

export type PortalHealthState = "ok" | "agencies" | "integration";

/**
 * „Integrarea nu funcționează” când e o problemă de configurare a platformei
 * (indiferent câte agenții are portalul), când eșuează la toate agențiile
 * conectate sau la contul Habitoo.
 */
export function portalHealth(total: number, failing: number, partnerAccountBroken = false, platformConfigBroken = false): PortalHealthState {
  if (partnerAccountBroken || platformConfigBroken || (total > 0 && failing >= total)) return "integration";
  return failing > 0 ? "agencies" : "ok";
}

export function portalHealthLabel(state: PortalHealthState, failing: number): string {
  if (state === "integration") return "Integrarea nu funcționează";
  if (state === "agencies") return failing === 1 ? "1 agenție cu eroare de conectare" : `${failing} ${failing >= 20 ? "de " : ""}agenții cu eroare de conectare`;
  return "Funcționează";
}

export function connectionsLabel(n: number): string {
  if (n === 0) return "Toate conexiunile funcționează";
  return n === 1 ? "1 conexiune cu eroare" : `${n} ${n >= 20 ? "de " : ""}conexiuni cu eroare`;
}
