/**
 * Mail Center — delivery events handler (Mailgun webhooks), kept out of the
 * route file so it can be tested with an injected database client.
 */
import {
  deliveryStatusForEvent,
  hashRecipient,
  messageStatusForDelivery,
  normalizeEvent,
  safeLogFields,
  shouldApplyDelivery,
} from "@/lib/mailgun";
import { SIGNATURE_WINDOW_SECONDS, verifyMailgunSignature } from "@/lib/mailgun.server";

const MAX_BODY_BYTES = 512 * 1024;
/** Generous on purpose: event bursts are normal Mailgun behaviour. */
const RATE_LIMIT = { limit: 600, windowSeconds: 60 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

type SignaturePayload = { timestamp?: string; token?: string; signature?: string };

export async function handleMailgunEvents(
  request: Request,
  deps: { signingKey: string | null; getDb: () => Promise<Db>; nowSeconds?: number },
): Promise<Response> {
  if (!deps.signingKey) return json({ ok: false, error: "not_configured" }, 503);

  const length = Number(request.headers.get("content-length") ?? "0");
  if (length && length > MAX_BODY_BYTES)
    return json({ ok: false, error: "payload_too_large" }, 413);

  let body: { signature?: SignaturePayload; "event-data"?: unknown } = {};
  try {
    body = ((await request.json()) ?? {}) as typeof body;
  } catch {
    body = {};
  }

  // Signature first: nothing is read or written for an unsigned request.
  const check = verifyMailgunSignature(
    {
      timestamp: body.signature?.timestamp,
      token: body.signature?.token,
      signature: body.signature?.signature,
    },
    deps.signingKey,
    deps.nowSeconds,
  );
  if (!check.ok) {
    console.warn(
      "[mailgun:events] rejected",
      safeLogFields({ metric: "mail_webhook_rejected", reason: check.reason }),
    );
    return json({ ok: false, error: "invalid_signature" }, 401);
  }

  const event = normalizeEvent(body["event-data"]);
  // 406 tells Mailgun not to retry an event we will never understand.
  if (!event) return json({ ok: false, error: "unsupported_event" }, 406);

  const db = await deps.getDb();

  // Replay protection: the signing token is single-use inside its window.
  const { data: fresh, error: nonceError } = await db.rpc("mail_webhook_nonce_claim", {
    _bucket: "mailgun:events",
    _token: body.signature!.token!,
    _ttl_seconds: SIGNATURE_WINDOW_SECONDS,
  });
  if (nonceError) {
    console.error("[mailgun:events] nonce claim failed", safeLogFields({ code: nonceError.code }));
    return json({ ok: false, error: "temporary_failure" }, 500);
  }
  if (fresh === false) {
    console.info("[mailgun:events] replay ignored", safeLogFields({ metric: "mail_duplicate" }));
    return json({ ok: true, replay: true }, 200);
  }

  const { data: allowed, error: rlError } = await db.rpc("mail_rate_limit_hit", {
    _bucket: "mailgun:events",
    _limit: RATE_LIMIT.limit,
    _window_seconds: RATE_LIMIT.windowSeconds,
  });
  if (rlError) {
    console.error("[mailgun:events] rate limit check failed", safeLogFields({ code: rlError.code }));
    return json({ ok: false, error: "temporary_failure" }, 500);
  }
  if (allowed === false) return json({ ok: false, error: "rate_limited" }, 429);

  // Only OUR outbound messages are updated; ids are stored without <>.
  let message: { id: string; delivery_status: string | null } | null = null;
  if (event.providerMessageId) {
    const { data: match } = await db
      .from("email_messages")
      .select("id, delivery_status")
      .eq("provider", "mailgun")
      .eq("direction", "outbound")
      .eq("provider_message_id", event.providerMessageId)
      .limit(1);
    message = match?.[0] ?? null;
  }

  if (!message) {
    // 200 so Mailgun stops retrying; nothing is written for unknown messages.
    console.info(
      "[mailgun:events] unknown message",
      safeLogFields({ metric: "mail_event_unmatched", event_type: event.eventType }),
    );
    return json({ ok: true, matched: false }, 200);
  }

  // Idempotency: the unique (provider, event_key) index turns a redelivery of
  // the same Mailgun event into a no-op instead of a second row.
  const { error: eventError } = await db.from("email_events").upsert(
    {
      event_key: event.eventKey,
      provider: "mailgun",
      event_type: event.eventType,
      provider_message_id: event.providerMessageId,
      message_id: message.id,
      recipient_hash: hashRecipient(event.recipient),
      severity: event.severity,
      reason: event.reason,
      error_code: event.errorCode,
      occurred_at: event.occurredAt,
    },
    { onConflict: "provider,event_key", ignoreDuplicates: true },
  );
  if (eventError) {
    console.error("[mailgun:events] insert failed", safeLogFields({ code: eventError.code }));
    return json({ ok: false, error: "temporary_failure" }, 500);
  }

  const delivery = deliveryStatusForEvent(event.eventType);
  // Forward only: a late, weaker event never downgrades a recorded outcome.
  let applied = false;
  if (delivery && shouldApplyDelivery(message.delivery_status, delivery)) {
    const lifecycle = messageStatusForDelivery(delivery);
    const patch: Record<string, string | null> = {
      delivery_status: delivery,
      error_code: event.errorCode,
    };
    if (lifecycle) patch["status"] = lifecycle;
    if (delivery === "delivered") {
      patch["delivered_at"] = event.occurredAt ?? new Date().toISOString();
    }
    if (delivery === "permanent_fail" || delivery === "temporary_fail") {
      patch["last_error"] = event.reason ?? event.severity ?? null;
    }
    await db.from("email_messages").update(patch).eq("id", message.id);
    applied = true;
  }

  console.info(
    "[mailgun:events] processed",
    safeLogFields({ metric: "mail_event", event_type: event.eventType, applied }),
  );
  return json({ ok: true, matched: true, applied }, 200);
}
