/**
 * Semnătura webhook-urilor Housera (Standard Webhooks), fără acces la DB.
 * Șirul semnat: `{webhook-id}.{webhook-timestamp}.{corp brut}`, HMAC-SHA256,
 * base64; cheia = partea de după `whsec_`, decodată base64. Toleranță ±5 minute.
 */
export const HOUSERA_WEBHOOK_TOLERANCE_S = 300;
export const HOUSERA_WEBHOOK_RATE_LIMIT = { limit: 120, windowSeconds: 60 } as const;

export function houseraWebhookKey(secret: string | null | undefined): Uint8Array | null {
  const s = secret?.trim();
  if (!s || !s.startsWith("whsec_")) return null;
  try {
    const bin = atob(s.slice("whsec_".length));
    if (!bin.length) return null;
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function houseraSignature(key: Uint8Array, id: string, timestamp: string, body: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));
  let bin = "";
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Comparație în timp constant (pe lungimea șirului așteptat). */
export function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ (b.charCodeAt(i % Math.max(b.length, 1)) || 0);
  return diff === 0;
}

export type HouseraSignatureCheck = { valid: boolean; present: boolean; note: string };

export async function verifyHouseraSignature(input: {
  secret: string | null | undefined;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  nowSec: number;
}): Promise<HouseraSignatureCheck> {
  const present = Boolean(input.signature?.trim());
  if (!present || !input.id || !input.timestamp) return { valid: false, present, note: "antete de semnătură lipsă" };
  const key = houseraWebhookKey(input.secret);
  if (!key) return { valid: false, present, note: "secret invalid" };
  if (!/^\d{1,12}$/.test(input.timestamp)) return { valid: false, present, note: "timestamp invalid" };
  if (Math.abs(input.nowSec - Number(input.timestamp)) > HOUSERA_WEBHOOK_TOLERANCE_S) return { valid: false, present, note: "timestamp în afara toleranței" };
  const expected = await houseraSignature(key, input.id, input.timestamp, input.body);
  let ok = false;
  for (const cand of input.signature!.trim().split(/\s+/)) {
    const comma = cand.indexOf(",");
    if (comma < 0 || cand.slice(0, comma) !== "v1") continue;
    if (constantTimeEqual(expected, cand.slice(comma + 1))) ok = true;
  }
  return ok ? { valid: true, present, note: "semnătură validă" } : { valid: false, present, note: "semnătură invalidă" };
}
