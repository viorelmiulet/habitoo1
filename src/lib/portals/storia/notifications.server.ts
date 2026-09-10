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
  valid: boolean | null;
  note: string;
};

/**
 * Verificare defensivă: orice formă de payload este acceptată la parsare, iar
 * lipsa semnăturii NU invalidează cererea (butonul „Test Callback” din App
 * Manager poate trimite fără semnătură, înainte ca secretul să fie salvat).
 * O semnătură prezentă dar greșită este însă respinsă.
 */
export function verifyNotificationSignature(args: {
  rawBody: string;
  parsed: unknown;
  signature: { header: string; value: string } | null;
}): SignatureCheck {
  const { rawBody, parsed, signature } = args;
  if (!signature) {
    return { present: false, valid: null, note: "semnătură absentă (acceptat pentru testul App Manager)" };
  }

  const secret = notificationSecret();
  if (!secret) {
    return {
      present: true,
      valid: null,
      note: "OLX_NOTIFICATION_SECRET neconfigurat: semnătura nu a putut fi verificată",
    };
  }

  const candidates = new Set<string>();
  candidates.add(hmacSha1Hex(secret, rawBody));

  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    const objectId = record["object_id"] ?? record["objectId"];
    const transactionId = record["transaction_id"] ?? record["transactionId"];
    if (objectId != null || transactionId != null) {
      candidates.add(hmacSha1Hex(secret, `${String(objectId ?? "")},${String(transactionId ?? "")}`));
    }
  }

  for (const candidate of candidates) {
    if (equalsHex(candidate, signature.value)) {
      return { present: true, valid: true, note: `semnătură validă (${signature.header})` };
    }
  }

  return { present: true, valid: false, note: `semnătură invalidă (${signature.header})` };
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

