/**
 * Criptare simetrică pentru datele sensibile din contracte (CNP, serie și
 * număr act de identitate). AES-256-GCM cu cheie derivată din secretul de
 * server `CONTRACT_PII_KEY`, pe același model folosit deja pentru
 * credențialele de portal. Cheia nu ajunge niciodată în bundle-ul de client,
 * iar valorile decriptate nu apar în audit sau în loguri.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(): Buffer {
  const raw = process.env["CONTRACT_PII_KEY"];
  if (!raw) throw new Error("Lipsește cheia de criptare pentru datele de contract.");
  return createHash("sha256").update(raw).digest();
}

export function encryptPii(plain: string | null | undefined): string | null {
  const value = (plain ?? "").trim();
  if (!value) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${encrypted.toString("base64url")}.${tag.toString("base64url")}`;
}

export function decryptPii(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const [, iv, data, tag] = parts as [string, string, string, string];
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

/** Hash pentru tokenurile de semnare: în baza de date nu ajunge valoarea brută. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Token de semnare imprevizibil (32 de bytes aleatori). */
export function newSignatureToken(): string {
  return randomBytes(32).toString("base64url");
}
