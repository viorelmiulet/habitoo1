/**
 * Criptare simetrică pentru credențialele primite de la portaluri.
 * AES-256-GCM cu cheie din secretul de server `PORTAL_CREDENTIALS_KEY`.
 * Cheia nu ajunge niciodată în bundle-ul de client, iar valoarea decriptată
 * nu este returnată în frontend, în audit sau în loguri.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { PortalError } from "./errors";

function key(): Buffer {
  const raw = process.env["PORTAL_CREDENTIALS_KEY"];
  if (!raw) throw new PortalError("CONFIG_ERROR", "missing_encryption_key");
  // Derivare deterministă la 32 de bytes, indiferent de lungimea secretului.
  return createHash("sha256").update(raw).digest();
}

export function encryptPortalCredential(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${encrypted.toString("base64url")}.${tag.toString("base64url")}`;
}

export function decryptPortalCredential(payload: string | null): string | null {
  if (!payload) return null;
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new PortalError("CONFIG_ERROR", "bad_credential_format");
  const [, iv, data, tag] = parts as [string, string, string, string];
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new PortalError("CONFIG_ERROR", "credential_decrypt_failed");
  }
}

/** Prefix scurt, sigur de afișat, pentru a identifica un credențial salvat. */
export function credentialFingerprint(plain: string): string {
  return createHash("sha256").update(plain).digest("hex").slice(0, 8);
}
