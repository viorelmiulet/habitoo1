/**
 * POST /api/public/requests/upsert — cereri de clienți din grupuri publice (hbsync).
 * Header obligatoriu: x-scraper-secret (aceeași cheie ca /api/public/listings/upsert).
 * Body: { "requests": [ ... ] }, 1–500 pe apel; upsert idempotent pe (source, external_id).
 * Localitatea/zonele se normalizează în baza de date, cu aceeași nomenclatură ca anunțurile.
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { buildSocialRequestRow, socialRequestsBodySchema } from "@/lib/social-requests";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8"), b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/requests/upsert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = [process.env["HBSYNC_SECRET"], process.env["SCRAPER_SECRET"]].filter((v): v is string => Boolean(v));
        if (expected.length === 0) return json({ success: false, error: "server_misconfigured" }, 500);
        const provided = request.headers.get("x-scraper-secret") ?? "";
        if (!provided || !expected.some((key) => secretMatches(provided, key))) return json({ success: false, error: "unauthorized" }, 401);
        let raw: unknown;
        try { raw = await request.json(); } catch { return json({ success: false, error: "invalid_json" }, 400); }
        const parsed = socialRequestsBodySchema.safeParse(raw);
        if (!parsed.success) return json({ success: false, error: "invalid_body", details: parsed.error.issues.slice(0, 5) }, 400);
        const byKey = new Map(parsed.data.requests.map((r) => { const row = buildSocialRequestRow(r); return [`${row.source}|${row.external_id}`, row]; }));
        const rows = [...byKey.values()];
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.from("social_requests").upsert(rows as never, { onConflict: "source,external_id" });
        if (error) {
          console.error(`[requests-upsert] ${error.message}`);
          return json({ success: false, error: "db_error" }, 500);
        }
        return json({ success: true, upserted: rows.length });
      },
    },
  },
});
