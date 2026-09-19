/**
 * Hash-urile colectorului (server-only).
 *
 * Amprenta vânzătorului este un HMAC cu un secret de pe server, calculat din
 * telefonul normalizat E.164. Numărul există doar în memorie, atât cât să fie
 * hash-uit, și nu se scrie NICIODATĂ: nici în coloane, nici în jurnale, nici
 * în mesaje de eroare.
 */
import { createHash, createHmac } from "node:crypto";
import { listingHashInput, normalizePhoneE164, type CollectorNormalizedFields } from "./normalize";

export const COLLECTOR_HMAC_SECRET_MISSING =
  "Secretul pentru amprenta vânzătorului lipsește; colectarea nu poate porni.";

function hmacSecret(): string {
  const secret = process.env["COLLECTOR_PHONE_HMAC_SECRET"];
  if (!secret) throw new Error(COLLECTOR_HMAC_SECRET_MISSING);
  return secret;
}

/** Amprenta stabilă a unui telefon; null dacă numărul nu e plauzibil. */
export function sellerFingerprint(phone: string | null | undefined, secret?: string): string | null {
  const normalized = normalizePhoneE164(phone);
  if (!normalized) return null;
  return createHmac("sha256", secret ?? hmacSecret()).update(normalized, "utf8").digest("hex");
}

export function listingHash(fields: CollectorNormalizedFields): string {
  return createHash("sha256").update(listingHashInput(fields), "utf8").digest("hex");
}
