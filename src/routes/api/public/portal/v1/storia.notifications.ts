/**
 * Endpoint public de notificări Storia.ro / OLX Group.
 *
 * FAZA „doar recepție”: primim, verificăm semnătura, jurnalizăm și răspundem
 * imediat 2xx. Procesarea fluxurilor (Advert Lifecycle, mesaje/lead-uri) vine
 * în Faza 4, după ce vedem structura reală a payload-ului în jurnale.
 *
 * Reguli respectate:
 *   - POST neautentificat, orice formă de payload (inclusiv gol) este acceptată;
 *   - răspuns rapid, fără procesare grea sincron;
 *   - semnătură absentă → se jurnalizează, dar se răspunde 2xx (altfel testul
 *     „Test Callback” din App Manager ar pica);
 *   - semnătură prezentă dar invalidă → 401.
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
          signature.valid === false
            ? "respins: semnătură invalidă"
            : "primit și jurnalizat; procesarea fluxurilor vine în Faza 4";

        await logStoriaNotification({
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

        return new Response(JSON.stringify({ status: "ok" }), { status: 200, headers: OK_HEADERS });
      },
    },
  },
});
