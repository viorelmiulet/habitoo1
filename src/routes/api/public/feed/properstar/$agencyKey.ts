/**
 * Ruta veche a feedului Properstar pe cheie de agenție:
 *   GET /api/public/feed/properstar/{agencyKey}.xml
 *
 * Retrasă: Properstar nu mai are chei pe agenție. Feedul se distribuie numai
 * prin indexul protejat cu PROPERSTAR_INDEX_KEY și linkurile semnate din el.
 * Răspunde 404 pentru orice cheie, fără să citească baza de date.
 */
import { createFileRoute } from "@tanstack/react-router";

export function properstarLegacyFeedResponse(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/feed/properstar/$agencyKey")({
  server: {
    handlers: {
      GET: async () => properstarLegacyFeedResponse(),
    },
  },
});
