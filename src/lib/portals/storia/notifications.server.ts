/**
 * Recepția notificărilor Storia.ro / OLX Group (Faza „doar recepție”).
 *
 * Aici NU se procesează fluxurile (Advert Lifecycle / Publish Advert): doar se
 * verifică semnătura, se jurnalizează cererea și se răspunde rapid 2xx.
 * Documentația OLX: semnătura vine în headerul `x-signature`, HMAC-SHA1 hex
 * peste `"<object_id>,<transaction_id>"`. Pentru robustețe verificăm și
 * varianta „HMAC peste corpul brut”, folosită de unele integrări OLX.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Headerele pe care le jurnalizăm (fără nimic sensibil de tip token). */
const LOGGED_HEADERS = [
  "content-type",
  "user-agent",
  "x-signature",
  "x-olx-signature",
  "x-hub-signature",
  "x-request-id",
  "x-transaction-id",
];

const SIGNATURE_HEADERS = ["x-signature", "x-olx-signature", "x-hub-signature"];

/** Limită de jurnalizare: suficient pentru depanare, fără a umfla baza. */
export const RAW_PAYLOAD_LOG_LIMIT = 8000;

export function notificationSecret(): string | null {
  return process.env["OLX_NOTIFICATION_SECRET"] || null;
}

export function collectHeaders(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of LOGGED_HEADERS) {
    const value = request.headers.get(name);
    if (value) out[name] = value.slice(0, 500);
  }
  return out;
}

export function readSignature(request: Request): { header: string; value: string } | null {
  for (const name of SIGNATURE_HEADERS) {
    const value = request.headers.get(name);
    if (value) return { header: name, value: value.trim() };
  }
  return null;
}

function hmacSha1Hex(secret: string, payload: string): string {
  return createHmac("sha1", secret).update(payload, "utf8").digest("hex");
}

function equalsHex(a: string, b: string): boolean {
  // Normalizăm prefixe de tip `sha1=` și diferențele de capitalizare.
  const normalize = (v: string) => v.replace(/^sha1=/i, "").toLowerCase();
  const left = Buffer.from(normalize(a), "utf8");
  const right = Buffer.from(normalize(b), "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export type SignatureCheck = {
  present: boolean;
  valid: boolean;
  note: string;
};

/**
 * Semnătura documentată de OLX: `x-signature` = HMAC-SHA1 hex peste
 * `"<object_id>,<transaction_id>"`, cu secretul aplicației. Verificată pe
 * toate evenimentele reale din jurnal. Lipsa semnăturii, lipsa secretului sau
 * o semnătură greșită înseamnă cerere respinsă (401, fără procesare).
 */
export function verifyNotificationSignature(args: {
  parsed: unknown;
  signature: { header: string; value: string } | null;
  secret?: string | null;
}): SignatureCheck {
  const { parsed, signature } = args;
  if (!signature) return { present: false, valid: false, note: "semnătură absentă" };

  const secret = args.secret === undefined ? notificationSecret() : args.secret;
  if (!secret) {
    return { present: true, valid: false, note: "OLX_NOTIFICATION_SECRET neconfigurat" };
  }

  const record =
    parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  const objectId = record?.["object_id"];
  const transactionId = record?.["transaction_id"];
  if (objectId == null || transactionId == null) {
    return { present: true, valid: false, note: "payload fără object_id/transaction_id" };
  }

  const expected = hmacSha1Hex(secret, `${String(objectId)},${String(transactionId)}`);
  return equalsHex(expected, signature.value)
    ? { present: true, valid: true, note: `semnătură validă (${signature.header})` }
    : { present: true, valid: false, note: `semnătură invalidă (${signature.header})` };
}

/** IP-ul clientului, pentru limitarea de rată. */
export function clientIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return "unknown";
}

/** Momentul evenimentului în ms (`event_timestamp`, altfel `timestamp`; secunde sau ms). */
export function storiaEventTimestampMs(parsed: unknown): number | null {
  const record =
    parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  if (!record) return null;
  for (const key of ["event_timestamp", "timestamp"]) {
    const raw = Number(record[key]);
    if (Number.isFinite(raw) && raw > 0) return raw < 1e12 ? Math.round(raw * 1000) : Math.round(raw);
  }
  return null;
}

/** Un eveniment strict mai vechi decât ultimul aplicat pe anunț este ignorat. */
export function isStaleStoriaEvent(eventMs: number | null, lastAppliedIso: string | null): boolean {
  if (eventMs === null || !lastAppliedIso) return false;
  const last = Date.parse(lastAppliedIso);
  return Number.isFinite(last) && eventMs < last;
}

/** Limita de rată pe IP: cereri per fereastră. */
export const STORIA_WEBHOOK_RATE_LIMIT = { limit: 120, windowSeconds: 60 } as const;

/** Reprocesare: maxim 5 încercări, pauză crescătoare (1, 5, 15, 60 minute). */
export const STORIA_MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

export function storiaRetryDelayMs(attempts: number): number | null {
  if (attempts >= STORIA_MAX_ATTEMPTS) return null;
  return RETRY_DELAYS_MS[Math.max(0, attempts - 1)] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]!;
}

export function parsePayload(rawBody: string): unknown {
  if (!rawBody.trim()) return null;
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

/**
 * Jurnalizează cererea și întoarce id-ul rândului (necesar pentru marcarea
 * procesării). Niciodată nu propagă erori către răspuns.
 */
export async function logStoriaNotification(args: {
  method: string;
  headers: Record<string, string>;
  rawBody: string;
  parsed: unknown;
  signature: SignatureCheck;
  processNote: string;
}): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("portal_webhook_events")
      .insert({
        portal: "storia",
        http_method: args.method,
        headers: args.headers,
        raw_payload: args.rawBody.slice(0, RAW_PAYLOAD_LOG_LIMIT) || null,
        parsed_payload:
          args.parsed && typeof args.parsed === "object"
            ? (args.parsed as Record<string, never>)
            : null,

        signature_present: args.signature.present,
        signature_valid: args.signature.valid,
        signature_note: args.signature.note,
        processed: false,
        process_note: args.processNote,
      })
      .select("id")
      .maybeSingle();
    return data?.id ?? null;
  } catch (error) {
    console.error("[storia] jurnalizarea notificării a eșuat", error);
    return null;
  }
}
