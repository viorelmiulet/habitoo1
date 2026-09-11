/**
 * Mail Center — delivery events webhook (Mailgun tracking).
 *
 * Public by necessity; every request must carry a valid HMAC signature.
 * Events are idempotent on Mailgun's own event id and update the delivery
 * status of the matching outbound message.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  deliveryStatusForEvent,
  hashRecipient,
  messageStatusForDelivery,
  normalizeEvent,
  safeLogFields,
  shouldApplyDelivery,
} from "@/lib/mailgun";
import {
  SIGNATURE_WINDOW_SECONDS,
  getMailgunConfig,
  verifyMailgunSignature,
} from "@/lib/mailgun.server";

const MAX_BODY_BYTES = 512 * 1024;
/** Generous on purpose: event bursts are normal Mailgun behaviour. */
const RATE_LIMIT = { limit: 600, windowSeconds: 60 };

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

type SignaturePayload = { timestamp?: string; token?: string; signature?: string };

async function handleEvents(request: Request): Promise<Response> {
  const cfg = getMailgunConfig();
  if (!cfg) return json({ ok: false, error: "not_configured" }, 503);

  const length = Number(request.headers.get("content-length") ?? "0");
  if (length && length > MAX_BODY_BYTES) return json({ ok: false, error: "payload_too_large" }, 413);

  let body: { signature?: SignaturePayload; "event-data"?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "invalid_body" }, 400);
  }

  const check = verifyMailgunSignature(
    {
      timestamp: body.signature?.timestamp,
      token: body.signature?.token,
      signature: body.signature?.signature,
    },
    cfg.signingKey,
  );
  if (!check.ok) {
    console.warn(
      "[mailgun:events] rejected",
      safeLogFields({ metric: "mail_webhook_rejected", reason: check.reason }),
    );
    return json({ ok: false, error: "invalid_signature" }, 401);
  }

  const event = normalizeEvent(body["event-data"]);
  if (!event) return json({ ok: false, error: "unsupported_event" }, 406);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Replay protection: the signing token is single-use inside its window.
  const { data: fresh, error: nonceError } = await supabaseAdmin.rpc("mail_webhook_nonce_claim", {
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

  const { data: allowed, error: rlError } = await supabaseAdmin.rpc("mail_rate_limit_hit", {
    _bucket: "mailgun:events",
    _limit: RATE_LIMIT.limit,
    _window_seconds: RATE_LIMIT.windowSeconds,
  });
  if (rlError) {
    console.error("[mailgun:events] rate limit check failed", safeLogFields({ code: rlError.code }));
    return json({ ok: false, error: "temporary_failure" }, 500);
  }
  if (allowed === false) return json({ ok: false, error: "rate_limited" }, 429);

  // Correlate with our own message, when the provider id is known.
  let message: { id: string; delivery_status: string | null } | null = null;
  if (event.providerMessageId) {
    const { data: match } = await supabaseAdmin
      .from("email_messages")
      .select("id, delivery_status")
      .eq("provider", "mailgun")
      .eq("provider_message_id", event.providerMessageId)
      .limit(1);
    message = match?.[0] ?? null;
  }

  // Idempotency: the unique (provider, event_key) index turns a redelivery of
  // the same Mailgun event into a no-op instead of a second row.
  const { error: eventError } = await supabaseAdmin.from("email_events").upsert(
    {
      event_key: event.eventKey,
      provider: "mailgun",
      event_type: event.eventType,
      provider_message_id: event.providerMessageId,
      message_id: message?.id ?? null,
      // Recipients are personal data: only a stable hash is retained here.
      recipient_hash: hashRecipient(event.recipient),
      severity: event.severity,
      reason: event.reason,
      error_code: event.errorCode,
      occurred_at: event.occurredAt,
    },
    { onConflict: "provider,event_key" },
  );
  if (eventError) {
    console.error("[mailgun:events] insert failed", safeLogFields({ code: eventError.code }));
    return json({ ok: false, error: "temporary_failure" }, 500);
  }

  const delivery = deliveryStatusForEvent(event.eventType);
  // Out-of-order webhooks must never downgrade a stronger recorded outcome,
  // and `delivered_at` is only ever set, never cleared.
  if (message && delivery && shouldApplyDelivery(message.delivery_status, delivery)) {
    const lifecycle = messageStatusForDelivery(delivery);
    const patch: {
      delivery_status: string;
      error_code: string | null;
      status?: string;
      delivered_at?: string;
      last_error?: string | null;
    } = {
      delivery_status: delivery,
      error_code: event.errorCode,
    };

    if (lifecycle) patch["status"] = lifecycle;
    if (delivery === "delivered") {
      patch["delivered_at"] = event.occurredAt ?? new Date().toISOString();
    }
    if (delivery === "permanent_fail" || delivery === "temporary_fail") {
      patch["last_error"] = event.reason;
    }
    await supabaseAdmin.from("email_messages").update(patch).eq("id", message.id);
  }




  console.info(
    "[mailgun:events] processed",
    safeLogFields({
      metric: delivery === "delivered" ? "mail_delivered" : "mail_event",
      event_type: event.eventType,
      matched: !!message,
    }),
  );
  return json({ ok: true }, 200);
}


export const Route = createFileRoute("/api/public/mailgun/events")({
  server: {
    handlers: {
      POST: ({ request }) => handleEvents(request),
      GET: () =>
        new Response("Method Not Allowed", { status: 405, headers: { allow: "POST, OPTIONS" } }),
      OPTIONS: () => new Response(null, { status: 204, headers: { allow: "POST, OPTIONS" } }),
    },
  },
});
