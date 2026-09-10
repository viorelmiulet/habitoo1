/**
 * Endpoint public de notificări Storia.ro / OLX Group.
 *
 * Recepție + procesare (Faza 4, parțial):
 *   - jurnalizăm întotdeauna cererea în `portal_webhook_events`;
 *   - procesăm fluxul de mesaje (`incoming_message` → lead) și ciclul de viață
 *     al anunțului (`publish_advert` → `portal_listings.status`);
 *   - procesarea este scurtă (câteva interogări) și nu poate întârzia răspunsul
 *     cu operațiuni de rețea externe; orice eroare este prinsă și notată în
 *     `process_note`, iar răspunsul rămâne 2xx.
 *
 * Reguli respectate:
 *   - POST neautentificat, orice formă de payload (inclusiv gol) este acceptată;
 *   - semnătură absentă → se jurnalizează, dar se răspunde 2xx (altfel testul
 *     „Test Callback” din App Manager ar pica);
 *   - semnătură prezentă dar invalidă → 401, fără procesare.
 */

import { createFileRoute } from "@tanstack/react-router";

const OK_HEADERS = { "content-type": "application/json; charset=utf-8" } as const;

export const Route = createFileRoute("/api/public/portal/v1/storia/notifications")({
  server: {
    handlers: {
      // App Manager poate face un GET de sondare înainte de POST-ul de test.
      GET: async () => new Response(JSON.stringify({ status: "ok" }), { status: 200, headers: OK_HEADERS }),

      HEAD: async () => new Response(null, { status: 200 }),

      POST: async ({ request }) => {
        const {
          collectHeaders,
          readSignature,
          parsePayload,
          verifyNotificationSignature,
          logStoriaNotification,
        } = await import("@/lib/portals/storia/notifications.server");

        let rawBody = "";
        try {
          rawBody = await request.text();
        } catch {
          rawBody = "";
        }

        const headers = collectHeaders(request);
        const parsed = parsePayload(rawBody);
        const signature = verifyNotificationSignature({
          rawBody,
          parsed,
          signature: readSignature(request),
        });

        const processNote =
          signature.valid === false ? "respins: semnătură invalidă" : "primit și jurnalizat";

        const eventId = await logStoriaNotification({
          method: "POST",
          headers,
          rawBody,
          parsed,
          signature,
          processNote,
        });

        if (signature.valid === false) {
          return new Response(JSON.stringify({ status: "invalid_signature" }), {
            status: 401,
            headers: OK_HEADERS,
          });
        }

        const { processStoriaNotification } = await import("@/lib/portals/storia/leads.server");
        const result = await processStoriaNotification({ eventId, parsed });

        return new Response(JSON.stringify({ status: "ok", processed: result.processed }), {
          status: 200,
          headers: OK_HEADERS,
        });

      },
    },
  },
});
