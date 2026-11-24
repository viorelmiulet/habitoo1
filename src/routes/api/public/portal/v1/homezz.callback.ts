/**
 * Notificări HomeZZ (moderare 501/502, mesaje 503). Fără semnătură: singura
 * autentificare e `data.key`, comparată în timp constant cu cheile salvate.
 * Cheie lipsă/necunoscută → 401 fără salvare. Salvează (fără cheie, deduplicat
 * pe hash-ul corpului), procesează în 1,5 s și răspunde 200; restul se reia din cron.
 */
import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

export const Route = createFileRoute("/api/public/portal/v1/homezz/callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { HOMEZZ_CALLBACK_MAX_BYTES } = await import("@/lib/portals/homezz/callback");
        const declared = Number(request.headers.get("content-length") ?? "0");
        if (declared > HOMEZZ_CALLBACK_MAX_BYTES) return json({ status: "too_large" }, 413);
        let raw = "";
        try { raw = await request.text(); } catch { raw = ""; }
        const cb = await import("@/lib/portals/homezz/callback.server");
        const { processWithinBudget } = await import("@/lib/portals/storia/webhook-retry.server");
        try {
          const r = await cb.handleHomezzCallback(
            { raw, contentType: request.headers.get("content-type"), userAgent: request.headers.get("user-agent") },
            await cb.homezzCallbackDeps(),
            (fn) => processWithinBudget(fn, cb.HOMEZZ_INLINE_BUDGET_MS),
          );
          return json(r.body, r.status);
        } catch {
          return json({ status: "retry" }, 503);
        }
      },
    },
  },
});
