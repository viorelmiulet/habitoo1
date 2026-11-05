/**
 * Webhook Housera (Standard Webhooks): semnătură HMAC-SHA256 pe corpul brut,
 * ±5 minute, deduplicare după `webhook-id`, rutare după `connection`.
 * Salvează, procesează în limita de 1,5 s și răspunde; eșecurile rămân
 * `processed=false` și sunt reluate de `/api/public/cron/housera-events`.
 */
import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

let lastMissingLog = 0;

export const Route = createFileRoute("/api/public/portal/v1/housera/webhook")({
  server: {
    handlers: {
      GET: async () => json({ status: "ok" }, 200),
      HEAD: async () => new Response(null, { status: 200 }),
      POST: async ({ request }) => {
        const secret = process.env["HOUSERA_WEBHOOK_SECRET"];
        if (!secret) {
          if (Date.now() - lastMissingLog > 3_600_000) { lastMissingLog = Date.now(); console.error("[housera] webhook: HOUSERA_WEBHOOK_SECRET lipsește"); }
          return json({ status: "not_configured" }, 503);
        }
        const { verifyHouseraSignature, HOUSERA_WEBHOOK_RATE_LIMIT } = await import("@/lib/portals/housera/webhook");
        const { parseHouseraEvent } = await import("@/lib/portals/housera/events");
        const ev = await import("@/lib/portals/housera/events.server");
        const admin = await ev.houseraAdmin();

        const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
        const { data: allowed } = await admin.rpc("rate_limit_hit", {
          _bucket: `housera-webhook:${ip}`, _limit: HOUSERA_WEBHOOK_RATE_LIMIT.limit, _window_seconds: HOUSERA_WEBHOOK_RATE_LIMIT.windowSeconds,
        });
        if (allowed === false) return json({ status: "rate_limited" }, 429);

        let rawBody = "";
        try { rawBody = await request.text(); } catch { rawBody = ""; }
        const id = request.headers.get("webhook-id");
        const timestamp = request.headers.get("webhook-timestamp");
        const sig = await verifyHouseraSignature({
          secret, id, timestamp, signature: request.headers.get("webhook-signature"), body: rawBody, nowSec: Math.floor(Date.now() / 1000),
        });
        let parsed: unknown = null;
        try { parsed = JSON.parse(rawBody); } catch { parsed = null; }
        const event = parseHouseraEvent(parsed);
        // `webhook-id` = `id` din corp; altfel nu are încredere.
        const valid = sig.valid && !!event && event.id === id;
        const headers = { "webhook-id": id ?? "", "webhook-timestamp": timestamp ?? "", "user-agent": request.headers.get("user-agent") ?? "" };

        const orgId = valid && event ? await ev.resolveHouseraOrganization(admin, event) : null;
        const rec = await ev.recordHouseraEvent(admin, {
          organizationId: orgId, event, rawBody, headers, method: "POST",
          signature: { present: sig.present, valid, note: sig.valid && !valid ? "id diferit de webhook-id" : sig.note },
          processNote: valid ? "primit; procesare" : `respins: ${sig.note}`,
        }).catch(() => ({ id: null, duplicate: false }));

        if (!valid) return json({ status: "invalid_signature" }, 401);
        if (rec.duplicate) return json({ status: "ok", duplicate: true }, 200);
        if (!rec.id) return json({ status: "retry" }, 503);

        const { processWithinBudget } = await import("@/lib/portals/storia/webhook-retry.server");
        const outcome = await processWithinBudget(() => ev.processHouseraEventRow(admin, rec.id!, orgId, event!, 0), ev.HOUSERA_INLINE_BUDGET_MS);
        return json({ status: "ok", processed: outcome === "done" }, 200);
      },
    },
  },
});
