import { createHmac } from "node:crypto";
import { encryptPortalCredential, decryptPortalCredential } from "@/lib/portals/crypto.server";

export function encryptImmofluxKey(plain: string) {
  const secret = process.env["PORTAL_CREDENTIALS_KEY"];
  if (!secret) throw new Error("Criptarea cheilor nu este configurată.");
  return { encrypted: encryptPortalCredential(plain), digest: createHmac("sha256", secret).update(plain).digest("hex") };
}

export function unlockImmofluxKey(encrypted: string): string {
  const key = decryptPortalCredential(encrypted);
  if (!key) throw new Error("Cheia API lipsește.");
  return key;
}