/**
 * Endpoint public de notificări Storia.ro / OLX Group.
 *
 * Reguli OLX (docs/webhooks):
 *   - semnătură obligatorie: `x-signature` = HMAC-SHA1(secret, "object_id,transaction_id");
 *     lipsă sau invalidă → 401, fără procesare (cererea rămâne în jurnal);
 *   - răspuns 2xx în maximum 2 secunde: salvăm evenimentul, răspundem 200 și
 *     procesăm după răspuns;
 *   - procesările eșuate rămân `processed = false` și sunt reluate periodic
 *     (maxim 5 încercări, pauză crescătoare) de `/api/public/cron/storia-webhook-retry`;
 *   - limitare simplă de rată pe IP.
 */

import { createFileRoute } from "@tanstack/react-router";

const OK_HEADERS = { "content-type": "application/json; charset=utf-8" } as const;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: OK_HEADERS });

export const Route = createFileRoute("/api/public/portal/v1/storia/notifications")({
  server: {
    handlers: {
      GET: async () => json({ status: "ok" }, 200),

      HEAD: async () => new Response(null, { status: 200 }),

      POST: async ({ request }) => {
        const {
          clientIp,
          collectHeaders,
          readSignature,
          parsePayload,
          verifyNotificationSignature,
          logStoriaNotification,
          STORIA_WEBHOOK_RATE_LIMIT,
        } = await import("@/lib/portals/storia/notifications.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: allowed } = await supabaseAdmin.rpc("rate_limit_hit", {
          _bucket: `storia-webhook:${clientIp(request)}`,
          _limit: STORIA_WEBHOOK_RATE_LIMIT.limit,
          _window_seconds: STORIA_WEBHOOK_RATE_LIMIT.windowSeconds,
        });
        if (allowed === false) return json({ status: "rate_limited" }, 429);

        let rawBody = "";
        try {
          rawBody = await request.text();
        } catch {
          rawBody = "";
        }

        const parsed = parsePayload(rawBody);
        const signature = verifyNotificationSignature({
          parsed,
          signature: readSignature(request),
        });

        const eventId = await logStoriaNotification({
          method: "POST",
          headers: collectHeaders(request),
          rawBody,
          parsed,
          signature,
          processNote: signature.valid
            ? "primit; procesare după răspuns"
            : `respins: ${signature.note}`,
        });

        if (!signature.valid) return json({ status: "invalid_signature" }, 401);

        // Fără rând în jurnal nu putem garanta reluarea: cerem OLX să reîncerce.
        if (!eventId) return json({ status: "retry" }, 503);

        const { runAfterResponse } = await import("@/lib/after-response");
        runAfterResponse(async () => {
          const { processStoriaNotification } = await import("@/lib/portals/storia/leads.server");
          await processStoriaNotification({ eventId, parsed, attempts: 0 });
        });

        return json({ status: "ok" }, 200);
      },
    },
  },
});
