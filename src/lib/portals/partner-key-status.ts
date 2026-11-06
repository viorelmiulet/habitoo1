/**
 * Portaluri cu cheie de partener unică pe server (Vumsi, HomeDirect): agenția nu
 * completează nimic. Conexiunea e gata când SuperAdminul a activat portalul și
 * cheia există pe server.
 */
import { hasHomedirectKey, HOMEDIRECT_KEY_MISSING_MESSAGE } from "@/lib/portals/homedirect/config";
import { hasVumsiKey, VUMSI_KEY_MISSING_MESSAGE } from "@/lib/portals/vumsi/config";

type Env = Record<string, string | undefined>;

const PARTNER_KEY_PORTALS: Record<string, { has: (env: Env) => boolean; missing: string }> = {
  vumsi: { has: hasVumsiKey, missing: VUMSI_KEY_MISSING_MESSAGE },
  homedirect: { has: hasHomedirectKey, missing: HOMEDIRECT_KEY_MISSING_MESSAGE },
};

export function isPartnerKeyPortal(portalId: string): boolean {
  return portalId in PARTNER_KEY_PORTALS;
}

/** Statusul conexiunii la activare/dezactivare; `null` pentru alte portaluri. */
export function partnerKeyConnectionStatus(
  portalId: string,
  activated: boolean,
  env: Env = process.env,
): { status: "ready" | "not_configured"; error: string | null } | null {
  const def = PARTNER_KEY_PORTALS[portalId];
  if (!def) return null;
  if (!def.has(env)) return { status: "not_configured", error: def.missing };
  return activated ? { status: "ready", error: null } : { status: "not_configured", error: null };
}

/**
 * Mesajul salvat „cheia nu este configurată pe server” rămâne în rând după ce
 * cheia a fost adăugată. Pentru portalurile cu cheie de partener, mesajul vechi
 * se ignoră când cheia există acum; restul mesajelor rămân neschimbate.
 */
export function currentPartnerKeyError(
  portalId: string,
  storedError: string | null,
  env: Env = process.env,
): string | null {
  const def = PARTNER_KEY_PORTALS[portalId];
  if (!def || storedError !== def.missing) return storedError;
  return def.has(env) ? null : storedError;
}
