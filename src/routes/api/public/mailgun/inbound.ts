/**
 * Mail Center — inbound webhook (Mailgun Routes).
 *
 * Public by necessity: Mailgun posts here. Trust comes solely from the HMAC
 * signature, never from the URL being secret. Order of operations is
 * deliberate: signature -> replay nonce -> rate limit -> idempotency -> store.
 * Nothing touches the database before the request is proven to be Mailgun's,
 * so unauthenticated traffic can never cost us a write.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_COUNT,
  normalizeInbound,
  safeLogFields,
  sanitizeFilename,
  validateAttachment,
  type InboundAttachmentMeta,
} from "@/lib/mailgun";
import {
  SIGNATURE_WINDOW_SECONDS,
  getMailgunConfig,
  verifyMailgunSignature,
} from "@/lib/mailgun.server";
import { resolveThread } from "@/lib/mail-threading.server";


const MAX_BODY_BYTES = 30 * 1024 * 1024;
/** Generous on purpose: Mailgun bursts must never be throttled as abuse. */
const RATE_LIMIT = { limit: 240, windowSeconds: 60 };
const ATTACHMENT_BUCKET = "mail-attachments";

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

/** Mailgun retries on 5xx; a 406 tells it to stop for permanently bad input. */
function reject(reason: string, status: number): Response {
  console.warn(
    "[mailgun:inbound] rejected",
    safeLogFields({ metric: "mail_webhook_rejected", reason, status }),
  );
  return json({ ok: false, error: reason }, status);
}

type UploadableAttachment = InboundAttachmentMeta & { bytes: Uint8Array | null };

async function handleInbound(request: Request): Promise<Response> {
  const cfg = getMailgunConfig();
  if (!cfg) return json({ ok: false, error: "not_configured" }, 503);

  // Mailgun Routes post urlencoded or multipart; anything else is not Mailgun.
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  const acceptedType =
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data");
  if (!acceptedType) return reject("unsupported_content_type", 415);

  const length = Number(request.headers.get("content-length") ?? "0");
  if (length && length > MAX_BODY_BYTES) return reject("payload_too_large", 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reject("invalid_body", 400);
  }

  const flat: Record<string, string> = {};
  const files: File[] = [];
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") flat[key] = value;
    else if (files.length < MAX_ATTACHMENT_COUNT) files.push(value);
  }

  const signature = verifyMailgunSignature(
    { timestamp: flat["timestamp"], token: flat["token"], signature: flat["signature"] },
    cfg.signingKey,
  );
  if (!signature.ok) return reject(`signature_${signature.reason}`, 401);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Replay protection beyond the HMAC: a token is accepted exactly once inside
  // the signature window. A replayed notification is acknowledged, not stored.
  const { data: fresh, error: nonceError } = await supabaseAdmin.rpc("mail_webhook_nonce_claim", {
    _bucket: "mailgun:inbound",
    _token: flat["token"]!,
    _ttl_seconds: SIGNATURE_WINDOW_SECONDS,
  });
  if (nonceError) {
    console.error("[mailgun:inbound] nonce claim failed", safeLogFields({ code: nonceError.code }));
    return json({ ok: false, error: "temporary_failure" }, 500);
  }
  if (fresh === false) {
    console.info("[mailgun:inbound] replay ignored", safeLogFields({ metric: "mail_duplicate" }));
    return json({ ok: true, replay: true }, 200);
  }

  // Rate limit per minute, bucketed for verified inbound traffic only.
  const { data: allowed, error: rlError } = await supabaseAdmin.rpc("mail_rate_limit_hit", {
    _bucket: "mailgun:inbound",
    _limit: RATE_LIMIT.limit,
    _window_seconds: RATE_LIMIT.windowSeconds,
  });
  if (rlError) {
    console.error("[mailgun:inbound] rate limit check failed", safeLogFields({ code: rlError.code ?? null }));
    return json({ ok: false, error: "temporary_failure" }, 500);
  }
  if (allowed === false) return json({ ok: false, error: "rate_limited" }, 429);

  const inlineAttachments: UploadableAttachment[] = files.map((file) => ({
    filename: sanitizeFilename(file.name),
    contentType: (file.type || "application/octet-stream").split(";")[0]!.trim().toLowerCase(),
    size: file.size,
    url: null,
    bytes: null,
  }));

  const inbound = normalizeInbound(flat, inlineAttachments);
  if (!inbound.fromEmail || !inbound.recipients.length) return reject("missing_addresses", 406);

  const mailbox = await resolveMailbox(supabaseAdmin, inbound.recipients);
  if (!mailbox) return reject("unknown_mailbox", 406);

  // Idempotency: Mailgun retries deliver the same Message-Id to the same mailbox.
  if (inbound.providerMessageId) {
    const { data: existing } = await supabaseAdmin
      .from("email_messages")
      .select("id")
      .eq("mailbox_id", mailbox.id)
      .eq("provider", "mailgun")
      .eq("provider_message_id", inbound.providerMessageId)
      .limit(1);
    if (existing?.length) {
      console.info("[mailgun:inbound] duplicate ignored", safeLogFields({ metric: "mail_duplicate" }));
      return json({ ok: true, duplicate: true, message_id: existing[0]!.id }, 200);
    }
  }

  const participants = Array.from(
    new Set([inbound.fromEmail, ...inbound.recipients, ...inbound.cc].filter((v): v is string => !!v)),
  );

  // Exact header linking first (In-Reply-To / References -> our own outbound
  // message), then the deterministic subject+counterpart key. Never fuzzy.
  const threadId = await resolveThread(supabaseAdmin, {
    mailboxId: mailbox.id,
    subject: inbound.subject,
    counterpart: inbound.fromEmail,
    participants,
    inReplyTo: inbound.inReplyTo,
    references: inbound.references,
  });
  if (!threadId) {
    console.error("[mailgun:inbound] thread resolution failed", safeLogFields({ metric: "mail_thread_failed" }));
    return json({ ok: false, error: "temporary_failure" }, 500);
  }

  const { data: message, error: messageError } = await supabaseAdmin
    .from("email_messages")
    .insert({
      thread_id: threadId,
      mailbox_id: mailbox.id,
      provider: "mailgun",
      provider_message_id: inbound.providerMessageId,
      direction: "inbound",
      status: "received",
      delivery_status: "received",
      from_email: inbound.fromEmail,
      from_name: inbound.fromName,
      to_emails: inbound.recipients,
      cc_emails: inbound.cc,
      reply_to: inbound.replyTo,
      subject: inbound.subject,
      text_body: inbound.text,
      stripped_text: inbound.strippedText,
      html_body: inbound.html,
      in_reply_to: inbound.inReplyTo,
      message_references: inbound.references,
      has_attachments: inbound.attachments.length > 0,
      size_bytes: inbound.sizeBytes,
      received_at: new Date().toISOString(),
      is_read: false,
    })
    .select("id")
    .single();

  if (messageError || !message) {
    // Unique index on (mailbox, provider, provider_message_id): a concurrent
    // retry already stored it. Acknowledge so Mailgun stops retrying.
    if (messageError?.code === "23505") {
      console.info("[mailgun:inbound] duplicate ignored", safeLogFields({ metric: "mail_duplicate" }));
      return json({ ok: true, duplicate: true }, 200);
    }
    console.error("[mailgun:inbound] insert failed", safeLogFields({ code: messageError?.code ?? null }));
    return json({ ok: false, error: "temporary_failure" }, 500);
  }

  // Bytes arrive inline only for multipart routes; read them after the message
  // row exists so a slow read can never delay the idempotency decision.
  for (let i = 0; i < inlineAttachments.length; i++) {
    const file = files[i];
    const entry = inlineAttachments[i];
    if (!file || !entry || file.size > MAX_ATTACHMENT_BYTES) continue;
    try {
      entry.bytes = new Uint8Array(await file.arrayBuffer());
    } catch {
      entry.bytes = null;
    }
  }

  const stored = await persistAttachments(
    supabaseAdmin,
    message.id,
    inbound.attachments.map((meta, index) => ({
      meta,
      bytes: inlineAttachments[index]?.bytes ?? null,
    })),
  );

  console.info(
    "[mailgun:inbound] stored",
    safeLogFields({
      metric: "mail_received",
      message_id: message.id,
      attachments: inbound.attachments.length,
      attachments_rejected: stored.rejected,
    }),
  );

  return json({ ok: true, message_id: message.id }, 200);
}

type AdminClient = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

/** Routes the message to a configured mailbox; unknown recipients are dropped. */
async function resolveMailbox(
  supabaseAdmin: AdminClient,
  recipients: string[],
): Promise<{ id: string; organization_id: string | null } | null> {
  const { data } = await supabaseAdmin
    .from("mailboxes")
    .select("id, address, organization_id")
    .eq("is_active", true)
    .in("address", recipients)
    .limit(1);
  return data?.[0] ? { id: data[0].id, organization_id: data[0].organization_id ?? null } : null;
}

/**
 * Attachment metadata is always recorded (including for rejected files, so an
 * administrator can see what was dropped and why). Bytes are stored in the
 * private bucket when they came inline, otherwise a job fetches them later.
 */
async function persistAttachments(
  supabaseAdmin: AdminClient,
  messageId: string,
  entries: { meta: InboundAttachmentMeta; bytes: Uint8Array | null }[],
): Promise<{ rejected: number }> {
  if (!entries.length) return { rejected: 0 };

  const checked = entries.slice(0, MAX_ATTACHMENT_COUNT).map((entry) => ({
    ...entry,
    check: validateAttachment({
      filename: entry.meta.filename,
      contentType: entry.meta.contentType,
      size: entry.meta.size,
    }),
  }));

  const rows = checked.map(({ meta, check }) => ({
    message_id: messageId,
    filename: check.filename,
    content_type: meta.contentType.split(";")[0]!.trim().toLowerCase(),
    size_bytes: Math.max(0, Math.trunc(meta.size)),
    status: check.ok ? "pending" : "rejected",
    rejected_reason: check.ok ? null : check.reason,
  }));

  const { data: inserted, error } = await supabaseAdmin
    .from("email_attachments")
    .insert(rows)
    .select("id, status");
  if (error) {
    console.error("[mailgun:inbound] attachment metadata failed", safeLogFields({ code: error.code }));
    return { rejected: 0 };
  }

  const rejected = checked.filter((c) => !c.check.ok).length;
  if (rejected) {
    console.warn(
      "[mailgun:inbound] attachments rejected",
      safeLogFields({ metric: "mail_attachment_rejected", count: rejected }),
    );
  }

  const jobs: {
    kind: string;
    dedupe_key: string;
    message_id: string;
    payload: Record<string, string>;
    status: string;
  }[] = [];

  for (let i = 0; i < (inserted ?? []).length; i++) {
    const row = inserted![i]!;
    const entry = checked[i];
    if (!entry || row.status !== "pending") continue;

    if (entry.bytes) {
      // Path is derived from ids only: no user-controlled path segment.
      const path = `${messageId}/${row.id}`;
      const upload = await supabaseAdmin.storage
        .from(ATTACHMENT_BUCKET)
        .upload(path, entry.bytes, { contentType: entry.check.ok ? entry.meta.contentType : "application/octet-stream", upsert: true });
      await supabaseAdmin
        .from("email_attachments")
        .update(
          upload.error
            ? { status: "failed", rejected_reason: "upload_failed" }
            : { status: "stored", storage_path: path },
        )
        .eq("id", row.id);
      continue;
    }

    if (entry.meta.url) {
      // Deferred download keeps the webhook fast and retry-safe.
      jobs.push({
        kind: "inbound_attachments",
        dedupe_key: `attachment:${row.id}`,
        message_id: messageId,
        payload: { attachment_id: row.id, url: entry.meta.url },
        status: "queued",
      });
    }
  }

  if (jobs.length) {
    await supabaseAdmin.from("email_jobs").upsert(jobs, { onConflict: "dedupe_key" });
  }

  return { rejected };
}

export const Route = createFileRoute("/api/public/mailgun/inbound")({
  server: {
    handlers: {
      POST: ({ request }) => handleInbound(request),
      GET: () =>
        new Response("Method Not Allowed", { status: 405, headers: { allow: "POST, OPTIONS" } }),
      OPTIONS: () => new Response(null, { status: 204, headers: { allow: "POST, OPTIONS" } }),
    },
  },
});
