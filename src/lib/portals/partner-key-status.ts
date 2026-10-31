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
