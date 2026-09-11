/**
 * Chei API emise de Habitoo pentru portaluri (direcția portal → Habitoo).
 * Cheia în clar este afișată o singură dată; în DB se salvează doar hash-ul.
 */
import { createHash, randomBytes } from "node:crypto";

export const PORTAL_KEY_SCOPES = ["feed:read", "agents:read", "leads:write"] as const;
export type PortalKeyScope = (typeof PORTAL_KEY_SCOPES)[number];

export function hashPortalKey(value: string): string {
  return createHash("sha256").update(value.trim()).digest("hex");
}

/** `<portal-prefix>_portal_<prefix>.<secret>` — prefixul identifică cheia în loguri. */
export function generatePortalKey(portalId: string): { key: string; prefix: string; hash: string } {
  const slug =
    portalId
      .replace(/[^a-z0-9]/gi, "")
      .slice(0, 6)
      .toLowerCase() || "portal";
  const prefix = `${slug}_portal_${randomBytes(4).toString("hex")}`;
  const secret = randomBytes(32).toString("base64url");
  const key = `${prefix}.${secret}`;
  return { key, prefix, hash: hashPortalKey(key) };
}

export function portalKeyPrefixOf(value: string | null): string | null {
  if (!value) return null;
  const prefix = value.split(".")[0] ?? "";
  return /_portal_[0-9a-f]{8}$/.test(prefix) ? prefix : null;
}
