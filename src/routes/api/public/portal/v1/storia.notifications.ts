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

        // Procesăm în aceeași cerere, cu limită de timp; peste limită răspundem
        // 200 oricum, iar evenimentul rămâne pentru reluarea periodică.
        const { processWithinBudget, STORIA_INLINE_BUDGET_MS } = await import(
          "@/lib/portals/storia/webhook-retry.server"
        );
        const { processStoriaNotification } = await import("@/lib/portals/storia/leads.server");
        const outcome = await processWithinBudget(
          () => processStoriaNotification({ eventId, parsed, attempts: 0 }),
          STORIA_INLINE_BUDGET_MS,
        );
        if (outcome !== "done") {
          // Armăm reluarea: altfel evenimentul n-ar fi preluat niciodată.
          await supabaseAdmin.rpc("storia_webhook_retry_arm").then(
            () => undefined,
            (error: unknown) => console.error("[storia] armarea reluării a eșuat", error),
          );
        }

        return json({ status: "ok", processed: outcome === "done" }, 200);
      },
    },
  },
});
