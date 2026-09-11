/**
 * Mail Center — pure helpers shared by the server code and the tests.
 *
 * Client-safe on purpose: no secrets, no network, no server imports. Anything
 * that touches the Mailgun API or the database lives in `mailgun.server.ts`.
 */

/* ------------------------------------------------------------------ */
/* Addresses                                                           */
/* ------------------------------------------------------------------ */

const EMAIL_RE = /^[^\s@<>",;]+@[^\s@<>",;]+\.[A-Za-z]{2,}$/;

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Lowercase + trim; returns null when the address is not usable. */
export function normalizeRecipient(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = parseAddress(value);
  return parsed.email && isEmail(parsed.email) ? parsed.email.toLowerCase() : null;
}

/** `"Ana Pop" <ana@x.ro>` -> { name: "Ana Pop", email: "ana@x.ro" }. */
export function parseAddress(raw: string): { name: string | null; email: string | null } {
  const value = (raw ?? "").trim();
  const angled = value.match(/^(.*)<([^>]+)>\s*$/);
  if (angled) {
    const name = angled[1]!.trim().replace(/^["']|["']$/g, "").trim();
    return { name: name || null, email: angled[2]!.trim().toLowerCase() || null };
  }
  return { name: null, email: value ? value.toLowerCase() : null };
}

/** Splits a comma separated header into normalized addresses. */
export function parseAddressList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => normalizeRecipient(part))
    .filter((v): v is string => !!v);
}

/* ------------------------------------------------------------------ */
/* Threading                                                           */
/* ------------------------------------------------------------------ */

const REPLY_PREFIX = /^\s*((re|fwd|fw|rif|aw|răspuns|raspuns)\s*(\[\d+\])?\s*:\s*)+/i;

export function normalizeSubject(subject: string | null | undefined): string {
  return (subject ?? "").replace(REPLY_PREFIX, "").replace(/\s+/g, " ").trim();
}

/** Angle brackets are part of the raw header, never of the stored id. */
export function normalizeMessageId(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().replace(/^<|>$/g, "").trim();
  return v ? v.slice(0, 512) : null;
}

export function parseReferences(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\s,]+/)
    .map((r) => normalizeMessageId(r))
    .filter((v): v is string => !!v)
    .slice(0, 50);
}

/**
 * Thread identity. `In-Reply-To`/`References` win when present (RFC 5322
 * threading); otherwise messages group by normalized subject + counterpart.
 */
export function deriveThreadKey(input: {
  inReplyTo?: string | null;
  references?: string[];
  subject?: string | null;
  counterpart?: string | null;
}): string {
  // `In-Reply-To` names the direct parent, so it is the most precise signal;
  // the first `References` entry (the thread root) is the fallback.
  const root =
    normalizeMessageId(input.inReplyTo ?? null) ?? normalizeMessageId(input.references?.[0] ?? null);
  if (root) return `mid:${root.toLowerCase()}`;
  const subject = normalizeSubject(input.subject).toLowerCase();
  const counterpart = (input.counterpart ?? "").toLowerCase();
  return `subj:${counterpart}|${subject || "(fără subiect)"}`;
}

/* ------------------------------------------------------------------ */
/* Attachments                                                         */
/* ------------------------------------------------------------------ */

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB, matches the bucket
export const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;
/** Hard cap on how many attachments a single message may carry. */
export const MAX_ATTACHMENT_COUNT = 20;


/** Allowlist: anything not listed here is stored as rejected metadata only. */
export const ALLOWED_ATTACHMENT_TYPES = [
  "application/pdf",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
];

/** Active content: never stored, never served. */
const BLOCKED_EXTENSIONS = [
  "exe", "dll", "bat", "cmd", "com", "msi", "scr", "pif", "jar", "js", "mjs",
  "vbs", "ps1", "sh", "app", "apk", "svg", "html", "htm", "xhtml", "hta", "iso",
];

export function fileExtension(filename: string): string {
  const clean = filename.split(/[\\/]/).pop() ?? "";
  const idx = clean.lastIndexOf(".");
  return idx > -1 ? clean.slice(idx + 1).toLowerCase() : "";
}

/** Strips paths and dangerous characters so a filename can be stored safely. */
export function sanitizeFilename(filename: string): string {
  const base = (filename ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^A-Za-z0-9._ -]/g, "_").replace(/\s+/g, " ").trim();
  return (cleaned || "atasament").slice(0, 180);
}

export type AttachmentCheck =
  | { ok: true; filename: string }
  | { ok: false; filename: string; reason: string };

export function validateAttachment(input: {
  filename: string;
  contentType: string;
  size: number;
}): AttachmentCheck {
  const filename = sanitizeFilename(input.filename);
  const type = (input.contentType || "").split(";")[0]!.trim().toLowerCase();

  if (BLOCKED_EXTENSIONS.includes(fileExtension(filename))) {
    return { ok: false, filename, reason: "extension_blocked" };
  }
  if (!ALLOWED_ATTACHMENT_TYPES.includes(type)) {
    return { ok: false, filename, reason: "mime_not_allowed" };
  }
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { ok: false, filename, reason: "size_unknown" };
  }
  if (input.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, filename, reason: "size_exceeded" };
  }
  return { ok: true, filename };
}

/** Stable, user-facing text for a rejection reason. No internals leak out. */
export function attachmentReasonMessage(reason: string): string {
  switch (reason) {
    case "extension_blocked":
      return "Tip de fișier neacceptat.";
    case "mime_not_allowed":
      return "Tip de fișier neacceptat.";
    case "size_exceeded":
      return "Fișierul depășește 10 MB.";
    case "size_unknown":
      return "Fișier gol sau invalid.";
    case "too_many":
      return "Maximum 20 de fișiere.";
    case "total_exceeded":
      return "Dimensiunea totală depășește 25 MB.";
    default:
      return "Fișier respins.";
  }
}

export type AttachmentSetCheck =
  | { ok: true; files: { filename: string; contentType: string; size: number }[] }
  | { ok: false; error: string; reason: string };

/**
 * Whole-set validation shared by inbound and outbound paths: per-file rules
 * plus the count and total-size caps. The server always re-runs this, so a
 * client that skips its own checks gains nothing.
 */
export function validateAttachmentSet(
  files: { filename: string; contentType: string; size: number }[],
): AttachmentSetCheck {
  if (files.length > MAX_ATTACHMENT_COUNT) {
    return { ok: false, error: attachmentReasonMessage("too_many"), reason: "too_many" };
  }
  const out: { filename: string; contentType: string; size: number }[] = [];
  for (const file of files) {
    const check = validateAttachment(file);
    if (!check.ok) {
      return { ok: false, error: attachmentReasonMessage(check.reason), reason: check.reason };
    }
    out.push({
      filename: check.filename,
      contentType: (file.contentType || "").split(";")[0]!.trim().toLowerCase(),
      size: file.size,
    });
  }
  const total = out.reduce((sum, f) => sum + f.size, 0);
  if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
    return { ok: false, error: attachmentReasonMessage("total_exceeded"), reason: "total_exceeded" };
  }
  return { ok: true, files: out };
}

/* ------------------------------------------------------------------ */
/* Thread preview                                                      */
/* ------------------------------------------------------------------ */

export const THREAD_PREVIEW_LENGTH = 160;

/**
 * Preview text for the thread list, built from the LAST message only.
 * Plain text wins (`stripped-text` before the full body); an HTML-only
 * message never leaks raw markup into the list — it gets a safe placeholder.
 */
export function threadPreview(
  input: { strippedText?: string | null; textBody?: string | null; hasHtml?: boolean | null },
  maxLength: number = THREAD_PREVIEW_LENGTH,
): string {
  const raw = input.strippedText ?? input.textBody ?? "";
  const normalized = raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return input.hasHtml ? "Mesaj HTML" : "";
  const limit = Math.max(20, maxLength);
  return normalized.length > limit ? `${normalized.slice(0, limit).trimEnd()}…` : normalized;
}


/* ------------------------------------------------------------------ */
/* Inbound normalization                                               */
/* ------------------------------------------------------------------ */

export type InboundAttachmentMeta = {
  filename: string;
  contentType: string;
  size: number;
  /** Mailgun storage reference; the file itself is fetched asynchronously. */
  url: string | null;
};

export type NormalizedInbound = {
  providerMessageId: string | null;
  sender: string | null;
  fromEmail: string | null;
  fromName: string | null;
  recipients: string[];
  cc: string[];
  replyTo: string | null;
  subject: string | null;
  date: string | null;
  text: string | null;
  strippedText: string | null;
  html: string | null;
  inReplyTo: string | null;
  references: string[];
  attachments: InboundAttachmentMeta[];
  sizeBytes: number | null;
};

function str(form: Record<string, string>, key: string): string | null {
  const v = form[key];
  return typeof v === "string" && v.length ? v : null;
}

/**
 * Maps a Mailgun Routes payload onto our own shape. We deliberately keep only
 * the fields the Mail Center needs — the raw body is never persisted.
 */
export function normalizeInbound(
  form: Record<string, string>,
  attachments: InboundAttachmentMeta[] = [],
): NormalizedInbound {
  const from = parseAddress(str(form, "from") ?? str(form, "sender") ?? "");
  const messageHeaders = str(form, "Message-Id") ?? str(form, "message-id");

  let attachmentMeta = attachments;
  if (!attachmentMeta.length) {
    // Routes with "store and notify" describe attachments as JSON metadata.
    const raw = str(form, "attachments");
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          attachmentMeta = parsed.slice(0, MAX_ATTACHMENT_COUNT).map((entry) => {
            const a = (entry ?? {}) as Record<string, unknown>;
            const name = a["name"] ?? a["filename"];
            const type = a["content-type"] ?? a["contentType"];
            const url = a["url"];
            return {
              filename: sanitizeFilename(typeof name === "string" ? name : "atasament"),
              contentType: typeof type === "string" ? type : "application/octet-stream",
              size: Number(a["size"]) || 0,
              url: typeof url === "string" ? url : null,
            };
          });
        }
      } catch {
        attachmentMeta = [];
      }
    }
  }


  return {
    providerMessageId: normalizeMessageId(messageHeaders),
    sender: normalizeRecipient(str(form, "sender")),
    fromEmail: from.email ? normalizeRecipient(from.email) : null,
    fromName: from.name,
    recipients: parseAddressList(str(form, "recipient") ?? str(form, "To") ?? str(form, "to")),
    cc: parseAddressList(str(form, "Cc") ?? str(form, "cc")),
    replyTo: normalizeRecipient(str(form, "Reply-To") ?? str(form, "reply-to")),
    subject: str(form, "subject") ?? str(form, "Subject"),
    date: str(form, "Date") ?? str(form, "timestamp"),
    text: str(form, "body-plain"),
    strippedText: str(form, "stripped-text"),
    html: str(form, "body-html") ?? str(form, "stripped-html"),
    inReplyTo: normalizeMessageId(str(form, "In-Reply-To") ?? str(form, "in-reply-to")),
    references: parseReferences(str(form, "References") ?? str(form, "references")),
    attachments: attachmentMeta,
    sizeBytes: Number(str(form, "message-size")) || null,
  };
}

/* ------------------------------------------------------------------ */
/* Delivery events                                                     */
/* ------------------------------------------------------------------ */

export const MAILGUN_EVENT_TYPES = [
  "accepted",
  "delivered",
  "temporary_fail",
  "permanent_fail",
  "failed",
  "opened",
  "clicked",
  "complained",
  "unsubscribed",
] as const;
export type MailgunEventType = (typeof MAILGUN_EVENT_TYPES)[number];

export type NormalizedEvent = {
  eventKey: string;
  eventType: MailgunEventType;
  providerMessageId: string | null;
  recipient: string | null;
  severity: string | null;
  reason: string | null;
  errorCode: string | null;
  occurredAt: string | null;
};

/* --- Status model ------------------------------------------------- */

/**
 * Two independent axes, never squashed into one column:
 *  - `MessageStatus`  — what WE did with the message (our lifecycle);
 *  - `DeliveryStatus` — what the PROVIDER reports about the delivery.
 * A message can be `sent` + `permanent_fail`, or `sent` + `delivered`.
 */
export const MESSAGE_STATUSES = ["draft", "queued", "sent", "received", "failed"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const DELIVERY_STATUSES = [
  "queued",
  "accepted",
  "delivered",
  "received",
  "temporary_fail",
  "permanent_fail",
  "complained",
  "unsubscribed",
  "failed",
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/**
 * Mailgun webhooks arrive out of order (a `delivered` can land after a
 * `temporary_fail` retry notice). Higher rank wins, so a late, weaker event
 * never downgrades a stronger, already recorded outcome.
 */
const DELIVERY_RANK: Record<DeliveryStatus, number> = {
  queued: 0,
  received: 0,
  accepted: 1,
  temporary_fail: 2,
  delivered: 3,
  complained: 4,
  unsubscribed: 4,
  permanent_fail: 5,
  failed: 5,
};

export function deliveryRank(status: string | null | undefined): number {
  if (!status) return -1;
  return DELIVERY_RANK[status as DeliveryStatus] ?? -1;
}

/** True when `next` is a stronger (or equal-and-newer) outcome than `current`. */
export function shouldApplyDelivery(current: string | null, next: DeliveryStatus): boolean {
  return deliveryRank(next) >= deliveryRank(current);
}

/** Provider outcome -> message lifecycle. `null` = lifecycle unchanged. */
export function messageStatusForDelivery(status: DeliveryStatus): MessageStatus | null {
  if (status === "permanent_fail" || status === "failed") return "failed";
  if (status === "accepted" || status === "delivered") return "sent";
  return null;
}

/** Maps a provider event onto the delivery status we store on the message. */
export function deliveryStatusForEvent(type: MailgunEventType): DeliveryStatus | null {
  switch (type) {
    case "accepted":
      return "accepted";
    case "delivered":
      return "delivered";
    case "temporary_fail":
      return "temporary_fail";
    case "permanent_fail":
    case "failed":
      return "permanent_fail";
    case "complained":
      return "complained";
    case "unsubscribed":
      return "unsubscribed";
    default:
      return null; // opened/clicked are engagement, not delivery state
  }
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Normalizes `event-data`. The event id comes from Mailgun (`id`); we never
 * invent one — without it the event cannot be de-duplicated and is rejected.
 */
export function normalizeEvent(eventData: unknown): NormalizedEvent | null {
  const data = obj(eventData);
  if (!Object.keys(data).length) return null;

  const rawType = String(data["event"] ?? "").toLowerCase();
  if (!(MAILGUN_EVENT_TYPES as readonly string[]).includes(rawType)) return null;
  const type = rawType as MailgunEventType;

  const rawId = data["id"];
  const eventKey = typeof rawId === "string" && rawId.trim() ? rawId.trim() : null;
  if (!eventKey) return null;

  const headers = obj(obj(data["message"])["headers"]);
  const deliveryStatus = obj(data["delivery-status"]);
  const ts = Number(data["timestamp"]);
  const headerId = headers["message-id"] ?? data["message-id"];
  const severity = data["severity"];
  const reason = data["reason"];

  return {
    eventKey: eventKey.slice(0, 200),
    eventType: type,
    providerMessageId: normalizeMessageId(typeof headerId === "string" ? headerId : null),
    recipient: normalizeRecipient(typeof data["recipient"] === "string" ? data["recipient"] : null),
    severity: typeof severity === "string" ? severity : null,
    reason: typeof reason === "string" ? reason.slice(0, 200) : null,
    errorCode:
      deliveryStatus["code"] !== undefined && deliveryStatus["code"] !== null
        ? String(deliveryStatus["code"]).slice(0, 20)
        : null,
    occurredAt: Number.isFinite(ts) ? new Date(ts * 1000).toISOString() : null,
  };
}


/* ------------------------------------------------------------------ */
/* Outbound validation                                                 */
/* ------------------------------------------------------------------ */

export type OutboundInput = {
  from?: string | null;
  to: string | string[];
  cc?: string | string[];
  replyTo?: string | null;
  subject: string;
  text?: string | null;
  html?: string | null;
  attachments?: { filename: string; contentType: string; size: number }[];
};

export type OutboundValidation =
  | { ok: true; value: { from: string; to: string[]; cc: string[]; replyTo: string | null; subject: string } }
  | { ok: false; error: string };

/**
 * Anti-spoofing: the sender is always one of the configured ClickImob
 * addresses/domains. Callers may pick from the allowlist, never set it freely.
 */
export function validateOutbound(
  input: OutboundInput,
  allowedFrom: string[],
  defaultFrom: string,
): OutboundValidation {
  const to = (Array.isArray(input.to) ? input.to : [input.to])
    .map((t) => normalizeRecipient(t))
    .filter((v): v is string => !!v);
  if (!to.length) return { ok: false, error: "Niciun destinatar valid." };
  if (to.length > 25) return { ok: false, error: "Prea mulți destinatari." };

  const cc = (Array.isArray(input.cc) ? input.cc : input.cc ? [input.cc] : [])
    .map((t) => normalizeRecipient(t))
    .filter((v): v is string => !!v);

  const subject = (input.subject ?? "").trim();
  if (!subject) return { ok: false, error: "Subiectul este obligatoriu." };
  if (subject.length > 250) return { ok: false, error: "Subiect prea lung." };
  if (/[\r\n]/.test(subject)) return { ok: false, error: "Subiect invalid." };

  if (!input.text && !input.html) return { ok: false, error: "Mesajul este gol." };

  const requested = input.from ? parseAddress(input.from) : null;
  let from = defaultFrom;
  if (requested?.email) {
    const email = requested.email.toLowerCase();
    const domain = email.split("@")[1] ?? "";
    const allowed = allowedFrom.some((entry) => {
      const e = entry.toLowerCase().trim();
      return e.startsWith("@") ? domain === e.slice(1) : e === email;
    });
    if (!allowed) return { ok: false, error: "Adresa expeditorului nu este permisă." };
    from = requested.name ? `${requested.name.replace(/[<>"\r\n]/g, "")} <${email}>` : email;
  }

  const replyTo = normalizeRecipient(input.replyTo ?? null);

  for (const att of input.attachments ?? []) {
    const check = validateAttachment(att);
    if (!check.ok) return { ok: false, error: `Atașament respins (${check.reason}).` };
  }
  const total = (input.attachments ?? []).reduce((sum, a) => sum + (a.size || 0), 0);
  if (total > MAX_TOTAL_ATTACHMENT_BYTES) return { ok: false, error: "Atașamente prea mari." };

  return { ok: true, value: { from, to, cc, replyTo, subject } };
}

/* ------------------------------------------------------------------ */
/* Logging safety                                                      */
/* ------------------------------------------------------------------ */

const SENSITIVE_KEYS =
  /(api[_-]?key|signing|signature|token|secret|password|authorization|body-plain|body-html|stripped-text|stripped-html|recipient|sender|^from$|^to$|^cc$|e?mail|address|subject)/i;

/** Only safe identifiers reach the logs — never bodies, keys or tokens. */
export function safeLogFields(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (SENSITIVE_KEYS.test(k)) continue;
    if (v === null || typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") out[k] = v.length > 120 ? `${v.slice(0, 120)}…` : v;
  }
  return out;
}

/** Recipients are personal data: logs and events keep a hash, not the address. */
export function hashRecipient(email: string | null): string | null {
  if (!email) return null;
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (Math.imul(31, h) + email.charCodeAt(i)) | 0;
  return `r_${(h >>> 0).toString(36)}`;
}
