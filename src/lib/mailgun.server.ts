/**
 * Mail Center — server-only Mailgun integration.
 *
 * The frontend NEVER talks to Mailgun: every call goes through this module,
 * which is the only place that reads the API key and the webhook signing key.
 * Nothing here is importable from the browser (`*.server.ts` is blocked from
 * client bundles).
 */
import { createHmac, timingSafeEqual } from "crypto";
import {
  hashRecipient,
  safeLogFields,
  parseAddress,
  validateOutbound,
  type OutboundInput,
} from "@/lib/mailgun";

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

export type MailgunConfig = {
  apiKey: string;
  domain: string;
  /** Receiving domain; defaults to the sending domain. */
  inboundDomain: string;
  /** Region aware: https://api.mailgun.net or https://api.eu.mailgun.net */
  baseUrl: string;
  signingKey: string;
  defaultFrom: string;
  /** Allowed sender addresses / `@domain` entries, anti-spoofing. */
  allowedFrom: string[];
  inboundAddress: string | null;
};

export type MailgunConfigStatus = {
  /** The only configuration signal the UI is ever given. */
  mailgun_configured: boolean;
  /** Which required pieces are missing — names only, never values. */
  missing: string[];
  /** Optional secrets that are not set yet. */
  optional_missing: string[];
  region: "EU" | "US";
  sending_domain: string | null;
  inbound_domain: string | null;
  inbound_endpoint: string;
  events_endpoint: string;
};

const DEFAULT_BASE_URL = "https://api.mailgun.net";
const EU_BASE_URL = "https://api.eu.mailgun.net";
const MAILGUN_HOST_RE = /^https:\/\/api(\.[a-z0-9-]+)?\.mailgun\.net$/;

/** Env is read per request on the Worker runtime — never at module scope. */
function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * Region -> API host. `eu` keeps the data in the EU (Romanian residency).
 * An explicit `MAILGUN_BASE_URL` still wins, but only for official hosts.
 */
function resolveBaseUrl(): string | null {
  const explicit = readEnv("MAILGUN_BASE_URL");
  if (explicit) {
    const clean = explicit.replace(/\/+$/, "");
    return MAILGUN_HOST_RE.test(clean) ? clean : null;
  }
  const region = readEnv("MAILGUN_REGION").toLowerCase();
  if (!region || region === "us") return DEFAULT_BASE_URL;
  if (region === "eu") return EU_BASE_URL;
  return null;
}

export function getMailgunConfig(): MailgunConfig | null {
  const apiKey = readEnv("MAILGUN_API_KEY");
  const domain = readEnv("MAILGUN_DOMAIN");
  const signingKey = readEnv("MAILGUN_WEBHOOK_SIGNING_KEY");
  if (!apiKey || !domain || !signingKey) return null;

  // Only official Mailgun API hosts, so a misconfigured value cannot turn the
  // outbound service into an arbitrary-URL fetcher.
  const baseUrl = resolveBaseUrl();
  if (!baseUrl) return null;

  const defaultFrom = readEnv("MAILGUN_DEFAULT_FROM") || `noreply@${domain}`;
  const allowedFrom = (readEnv("MAILGUN_ALLOWED_FROM") || `@${domain}`)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    apiKey,
    domain,
    inboundDomain: readEnv("MAILGUN_INBOUND_DOMAIN") || domain,
    baseUrl,
    signingKey,
    defaultFrom,
    allowedFrom,
    inboundAddress: readEnv("MAILGUN_INBOUND_ADDRESS") || null,
  };
}

export function getMailgunStatus(): MailgunConfigStatus {
  const missing: string[] = [];
  for (const key of ["MAILGUN_API_KEY", "MAILGUN_DOMAIN", "MAILGUN_WEBHOOK_SIGNING_KEY"]) {
    if (!readEnv(key)) missing.push(key);
  }
  if (!resolveBaseUrl())
    missing.push(readEnv("MAILGUN_BASE_URL") ? "MAILGUN_BASE_URL" : "MAILGUN_REGION");

  // Optional, but the mailbox is only usable end to end once they exist.
  const optional: string[] = [];
  for (const key of [
    "MAILGUN_REGION",
    "MAILGUN_INBOUND_DOMAIN",
    "MAILGUN_DEFAULT_FROM",
    "MAILGUN_ALLOWED_FROM",
  ]) {
    if (!readEnv(key)) optional.push(key);
  }

  return {
    mailgun_configured: missing.length === 0,
    missing,
    optional_missing: optional,
    region: readEnv("MAILGUN_REGION").toLowerCase() === "eu" ? "EU" : "US",
    sending_domain: readEnv("MAILGUN_DOMAIN") || null,
    inbound_domain: readEnv("MAILGUN_INBOUND_DOMAIN") || readEnv("MAILGUN_DOMAIN") || null,
    inbound_endpoint: "/api/public/mailgun/inbound",
    events_endpoint: "/api/public/mailgun/events",
  };
}

/* ------------------------------------------------------------------ */
/* Connection test (read-only)                                         */
/* ------------------------------------------------------------------ */

export type MailgunConnectionTest = {
  connected: boolean;
  /** Never a credential: only the public configuration surface. */
  domain: string | null;
  region: "EU" | "US" | null;
  apiBase: string | null;
  credentials: "configured" | "missing";
  httpStatus: number | null;
  /** Mailgun's own domain state (`active`, `unverified`, ...) when readable. */
  domainState: string | null;
  /** Whether Mailgun reports the domain as ready for sending. */
  sendingReady: boolean | null;
  missing: string[];
  error: string | null;
};

function regionOf(baseUrl: string): "EU" | "US" {
  return baseUrl.includes("api.eu.") ? "EU" : "US";
}

/**
 * Read-only credential + domain check: `GET /v3/domains/{domain}`.
 * Sends nothing, creates nothing, and never returns provider payloads that
 * could contain credentials — only a status summary.
 */
export async function testMailgunConnection(): Promise<MailgunConnectionTest> {
  const status = getMailgunStatus();
  const cfg = getMailgunConfig();
  if (!cfg) {
    return {
      connected: false,
      domain: readEnv("MAILGUN_DOMAIN") || null,
      region: null,
      apiBase: readEnv("MAILGUN_BASE_URL") || null,
      credentials: "missing",
      httpStatus: null,
      domainState: null,
      sendingReady: null,
      missing: status.missing,
      error: "Mailgun nu este configurat.",
    };
  }

  const base = {
    domain: cfg.domain,
    region: regionOf(cfg.baseUrl),
    apiBase: cfg.baseUrl,
    credentials: "configured" as const,
    missing: [] as string[],
  };

  try {
    const res = await fetch(`${cfg.baseUrl}/v3/domains/${encodeURIComponent(cfg.domain)}`, {
      method: "GET",
      headers: { Authorization: authHeader(cfg), Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    if (!res.ok) {
      console.warn(
        "[mailgun] connection test failed",
        safeLogFields({ status: res.status, metric: "mail_connection_test" }),
      );
      const error =
        res.status === 401 || res.status === 403
          ? "Credentials Mailgun respinse."
          : res.status === 404
            ? "Domeniul nu există în contul Mailgun."
            : "Mailgun connection failed";
      return {
        ...base,
        connected: false,
        httpStatus: res.status,
        domainState: null,
        sendingReady: null,
        error,
      };
    }

    let domainState: string | null = null;
    let sendingReady: boolean | null = null;
    try {
      const parsed = JSON.parse(text) as {
        domain?: { state?: string; is_disabled?: boolean };
        sending_dns_records?: { valid?: string }[];
      };
      domainState = parsed.domain?.state ?? null;
      const records = parsed.sending_dns_records ?? [];
      sendingReady = records.length
        ? records.every((r) => (r.valid ?? "").toLowerCase() === "valid")
        : domainState === "active";
    } catch {
      domainState = null;
    }

    console.info(
      "[mailgun] connection test",
      safeLogFields({ status: res.status, metric: "mail_connection_test" }),
    );
    return {
      ...base,
      connected: true,
      httpStatus: res.status,
      domainState,
      sendingReady,
      error: null,
    };
  } catch (e) {
    console.error(
      "[mailgun] connection test transport error",
      safeLogFields({ message: (e as Error).message, metric: "mail_connection_test" }),
    );
    return {
      ...base,
      connected: false,
      httpStatus: null,
      domainState: null,
      sendingReady: null,
      error: "Mailgun connection failed",
    };
  }
}

/* ------------------------------------------------------------------ */
/* Signature verification                                              */
/* ------------------------------------------------------------------ */

export const SIGNATURE_WINDOW_SECONDS = 15 * 60;

export type SignatureInput = { timestamp: string; token: string; signature: string };

export type SignatureResult =
  { ok: true } | { ok: false; reason: "missing" | "timestamp" | "token" | "signature" };

/**
 * Mailgun signs `timestamp + token` with the webhook signing key (HMAC-SHA256,
 * hex). Verification is timing-safe and rejects stale timestamps, which is the
 * replay protection for both webhooks.
 */
export function verifyMailgunSignature(
  input: Partial<SignatureInput>,
  signingKey: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  windowSeconds: number = SIGNATURE_WINDOW_SECONDS,
): SignatureResult {
  const { timestamp, token, signature } = input;
  if (!timestamp || !token || !signature || !signingKey) return { ok: false, reason: "missing" };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > windowSeconds) {
    return { ok: false, reason: "timestamp" };
  }
  // Mailgun tokens are 50 hex chars; reject anything else before hashing.
  if (!/^[a-f0-9]{20,100}$/i.test(token)) return { ok: false, reason: "token" };
  if (!/^[a-f0-9]{64}$/i.test(signature)) return { ok: false, reason: "signature" };

  const expected = createHmac("sha256", signingKey).update(`${timestamp}${token}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.toLowerCase(), "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "signature" };
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Outbound                                                            */
/* ------------------------------------------------------------------ */

export type SendResult =
  { ok: true; providerMessageId: string | null } | { ok: false; error: string; code?: number };

export type OutboundAttachment = {
  filename: string;
  contentType: string;
  size: number;
  data: Uint8Array;
};

function authHeader(cfg: MailgunConfig): string {
  return `Basic ${Buffer.from(`api:${cfg.apiKey}`).toString("base64")}`;
}

const SEND_MAX_ATTEMPTS = 3;

function retryableStatus(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One Mailgun POST /messages, retried on timeout / 429 / 5xx only.
 *
 * Retrying is safe against duplicates because callers pass a stable
 * `v:send-key`: Mailgun echoes it back on the delivery events, and our own
 * `email_messages.send_key` unique index makes a re-entrant send a no-op.
 * A 4xx (other than 429) is never retried — it is a permanent rejection.
 */
async function postMessages(cfg: MailgunConfig, form: FormData): Promise<SendResult> {
  let lastCode: number | undefined;
  for (let attempt = 1; attempt <= SEND_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${cfg.baseUrl}/v3/${encodeURIComponent(cfg.domain)}/messages`, {
        method: "POST",
        headers: { Authorization: authHeader(cfg) },
        body: form,
      });
      const text = await res.text();
      if (!res.ok) {
        // Provider status is useful; the body may echo recipients, so it is not logged.
        console.error(
          "[mailgun] send failed",
          safeLogFields({ status: res.status, attempt, metric: "mail_failed" }),
        );
        lastCode = res.status;
        if (retryableStatus(res.status) && attempt < SEND_MAX_ATTEMPTS) {
          await sleep(250 * 2 ** (attempt - 1));
          continue;
        }
        return { ok: false, error: "Trimiterea emailului a eșuat.", code: res.status };
      }
      let providerMessageId: string | null = null;
      try {
        const parsed = JSON.parse(text) as { id?: string };
        providerMessageId = parsed.id ? parsed.id.replace(/^<|>$/g, "") : null;
      } catch {
        providerMessageId = null;
      }
      return { ok: true, providerMessageId };
    } catch (e) {
      console.error(
        "[mailgun] transport error",
        safeLogFields({ message: (e as Error).message, attempt, metric: "mail_failed" }),
      );
      if (attempt < SEND_MAX_ATTEMPTS) {
        await sleep(250 * 2 ** (attempt - 1));
        continue;
      }
      return { ok: false, error: "Serviciul de email nu este disponibil." };
    }
  }
  return { ok: false, error: "Trimiterea emailului a eșuat.", code: lastCode };
}

/** Threading + idempotency options shared by the send helpers. */
export type SendOptions = {
  attachments?: OutboundAttachment[];
  inReplyTo?: string | null;
  references?: string[];
  /** Stable key echoed to Mailgun so a retry is recognisable end-to-end. */
  sendKey?: string | null;
  /** Extra RFC headers (e.g. List-Unsubscribe). Values are CRLF-stripped. */
  headers?: Record<string, string>;
  /** Opt out of provider open/click tracking for a given send. */
  tracking?: { opens?: boolean; clicks?: boolean };
};

/** Sends a plain/HTML email. Recipients and sender are validated first. */
export async function sendEmail(input: OutboundInput & SendOptions): Promise<SendResult> {
  const cfg = getMailgunConfig();
  if (!cfg) return { ok: false, error: "Mailgun nu este configurat." };

  const checked = validateOutbound(input, cfg.allowedFrom, cfg.defaultFrom);
  if (!checked.ok) return { ok: false, error: checked.error };

  const form = new FormData();
  form.set("from", checked.value.from);
  for (const to of checked.value.to) form.append("to", to);
  for (const cc of checked.value.cc) form.append("cc", cc);
  if (checked.value.replyTo) form.set("h:Reply-To", checked.value.replyTo);
  form.set("subject", checked.value.subject);
  if (input.text) form.set("text", input.text);
  if (input.html) form.set("html", input.html);

  // Threading headers, when the caller is replying to a stored message.
  if (input.inReplyTo) form.set("h:In-Reply-To", `<${input.inReplyTo}>`);
  if (input.references?.length) {
    form.set("h:References", input.references.map((r) => `<${r}>`).join(" "));
  }
  if (input.sendKey) form.set("v:send-key", input.sendKey);

  // Header injection is impossible: names are allowlisted by shape and values
  // are stripped of CR/LF before they reach the provider.
  for (const [name, value] of Object.entries(input.headers ?? {})) {
    if (!/^[A-Za-z][A-Za-z0-9-]{0,60}$/.test(name)) continue;
    const clean = String(value)
      .replace(/[\r\n]+/g, " ")
      .slice(0, 998)
      .trim();
    if (clean) form.set(`h:${name}`, clean);
  }
  if (input.tracking) {
    if (input.tracking.opens === false) form.set("o:tracking-opens", "no");
    if (input.tracking.clicks === false) form.set("o:tracking-clicks", "no");
  }

  for (const att of input.attachments ?? []) {
    form.append(
      "attachment",
      new Blob([new Uint8Array(att.data)], { type: att.contentType }),
      att.filename,
    );
  }

  const result = await postMessages(cfg, form);
  console.info(
    "[mailgun] outbound",
    safeLogFields({
      metric: result.ok ? "mail_sent" : "mail_failed",
      recipients: checked.value.to.length,
      recipient_hash: hashRecipient(checked.value.to[0] ?? null),
      ok: result.ok,
      provider_message_id: result.ok ? result.providerMessageId : null,
      code: result.ok ? null : (result.code ?? null),
    }),
  );
  return result;
}

/** Sends a Mailgun stored template with typed variables. */
export async function sendTemplateEmail(
  input: Omit<OutboundInput, "text" | "html"> & {
    template: string;
    variables?: Record<string, string | number | boolean>;
    attachments?: OutboundAttachment[];
  },
): Promise<SendResult> {
  const cfg = getMailgunConfig();
  if (!cfg) return { ok: false, error: "Mailgun nu este configurat." };

  const template = (input.template ?? "").trim();
  if (!/^[a-z0-9._-]{1,80}$/i.test(template)) return { ok: false, error: "Template invalid." };

  // Templates provide the body, so validation runs against a placeholder body.
  const checked = validateOutbound({ ...input, text: " " }, cfg.allowedFrom, cfg.defaultFrom);
  if (!checked.ok) return { ok: false, error: checked.error };

  const form = new FormData();
  form.set("from", checked.value.from);
  for (const to of checked.value.to) form.append("to", to);
  for (const cc of checked.value.cc) form.append("cc", cc);
  if (checked.value.replyTo) form.set("h:Reply-To", checked.value.replyTo);
  form.set("subject", checked.value.subject);
  form.set("template", template);
  if (input.variables && Object.keys(input.variables).length) {
    form.set("h:X-Mailgun-Variables", JSON.stringify(input.variables));
  }
  for (const att of input.attachments ?? []) {
    form.append(
      "attachment",
      new Blob([new Uint8Array(att.data)], { type: att.contentType }),
      att.filename,
    );
  }

  return await postMessages(cfg, form);
}

/**
 * Downloads an attachment from Mailgun's own storage (async job path only).
 * The URL is restricted to Mailgun hosts: no arbitrary URL fetching.
 */
export async function fetchMailgunAttachment(
  url: string,
  maxBytes: number,
): Promise<{ ok: true; data: Uint8Array; contentType: string } | { ok: false; error: string }> {
  const cfg = getMailgunConfig();
  if (!cfg) return { ok: false, error: "Mailgun nu este configurat." };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "URL invalid." };
  }
  if (parsed.protocol !== "https:" || !/(^|\.)mailgun\.(net|org)$/.test(parsed.hostname)) {
    return { ok: false, error: "Sursă neautorizată." };
  }

  const res = await fetch(parsed.toString(), { headers: { Authorization: authHeader(cfg) } });
  if (!res.ok) return { ok: false, error: `Descărcare eșuată (${res.status}).` };

  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return { ok: false, error: "size_exceeded" };

  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) return { ok: false, error: "size_exceeded" };
  return {
    ok: true,
    data: buf,
    contentType: (res.headers.get("content-type") ?? "application/octet-stream")
      .split(";")[0]!
      .trim(),
  };
}

/* ------------------------------------------------------------------ */
/* Logged outbound (send + persistence)                                */
/* ------------------------------------------------------------------ */

export type MailboxSendInput = OutboundInput &
  SendOptions & {
    /** Mailbox the message is sent from (owns the thread). */
    mailboxId: string;
    threadId?: string | null;
    /** Caller supplied idempotency key; one email per key, ever. */
    sendKey: string;
  };

export type MailboxSendResult =
  | { ok: true; messageId: string; providerMessageId: string | null; duplicate: boolean }
  | { ok: false; error: string };

/**
 * The only outbound path the Mail Center uses.
 *
 * Writes the send log first (`queued`), then sends, then records the outcome.
 * `send_key` is uniquely indexed, so a retried caller re-reads the existing row
 * instead of sending a second email. Bodies are stored on the message row (the
 * conversation), never in the application logs.
 */
export async function sendMailboxEmail(input: MailboxSendInput): Promise<MailboxSendResult> {
  const cfg = getMailgunConfig();
  if (!cfg) return { ok: false, error: "Mailgun nu este configurat." };

  const checked = validateOutbound(input, cfg.allowedFrom, cfg.defaultFrom);
  if (!checked.ok) return { ok: false, error: checked.error };

  const sendKey = (input.sendKey ?? "").trim().slice(0, 120);
  if (!sendKey) return { ok: false, error: "Cheia de trimitere lipsește." };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: existing } = await supabaseAdmin
    .from("email_messages")
    .select("id, provider_message_id")
    .eq("send_key", sendKey)
    .maybeSingle();
  if (existing) {
    return {
      ok: true,
      messageId: existing.id,
      providerMessageId: existing.provider_message_id,
      duplicate: true,
    };
  }

  const fromEmail = parseAddress(checked.value.from).email ?? cfg.defaultFrom;
  const { data: created, error: insertError } = await supabaseAdmin
    .from("email_messages")
    .insert({
      mailbox_id: input.mailboxId,
      thread_id: input.threadId ?? null,
      direction: "outbound",
      provider: "mailgun",
      send_key: sendKey,
      status: "queued",
      delivery_status: "queued",
      from_email: fromEmail,
      to_emails: checked.value.to,
      cc_emails: checked.value.cc,
      reply_to: checked.value.replyTo,
      subject: checked.value.subject,
      text_body: input.text ?? null,
      html_body: input.html ?? null,
      in_reply_to: input.inReplyTo ?? null,
      message_references: input.references ?? [],
      has_attachments: (input.attachments ?? []).length > 0,
    })
    .select("id")
    .single();

  if (insertError || !created) {
    // A concurrent caller won the unique index race: reuse its row.
    if (insertError?.code === "23505") {
      const { data: raced } = await supabaseAdmin
        .from("email_messages")
        .select("id, provider_message_id")
        .eq("send_key", sendKey)
        .maybeSingle();
      if (raced) {
        return {
          ok: true,
          messageId: raced.id,
          providerMessageId: raced.provider_message_id,
          duplicate: true,
        };
      }
    }
    console.error("[mailgun] send log failed", safeLogFields({ code: insertError?.code ?? null }));
    return { ok: false, error: "Emailul nu a putut fi înregistrat." };
  }

  const result = await sendEmail({ ...input, sendKey });

  await supabaseAdmin
    .from("email_messages")
    .update(
      result.ok
        ? {
            status: "sent",
            delivery_status: "accepted",
            provider_message_id: result.providerMessageId,
            sent_at: new Date().toISOString(),
            last_error: null,
          }
        : { status: "failed", delivery_status: "failed", last_error: result.error },
    )
    .eq("id", created.id);

  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    messageId: created.id,
    providerMessageId: result.providerMessageId,
    duplicate: false,
  };
}
