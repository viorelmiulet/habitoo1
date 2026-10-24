import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";
import { hbsyncMarketBodySchema } from "@/lib/market/hbsync";

const digest = (value: string) => createHash("sha256").update(value).digest();
export function marketImportSecretMatches(provided: string, expected: string) {
  return timingSafeEqual(digest(provided), digest(expected));
}

export const Route = createFileRoute("/api/public/market-listings/upsert")({
  server: { handlers: { POST: async ({ request }) => {
    const secrets = [process.env["HBSYNC_SECRET"], process.env["SCRAPER_SECRET"]].filter((value): value is string => Boolean(value));
    if (secrets.length === 0) return Response.json({ success: false, error: "not_configured" }, { status: 503 });
    const provided = request.headers.get("x-scraper-secret");
    if (!provided || !secrets.some(secret => marketImportSecretMatches(provided, secret))) {
      return Response.json({ success: false, error: "unauthorized" }, { status: 401 });
    }
    const reader = request.body?.getReader();
    if (!reader) return Response.json({ success: false, error: "invalid_body" }, { status: 400 });
    let raw = "";
    let bytes = 0;
    const decoder = new TextDecoder();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > 10 * 1024 * 1024) {
          await reader.cancel();
          return Response.json({ success: false, error: "body_too_large" }, { status: 413 });
        }
        raw += decoder.decode(chunk.value, { stream: true });
      }
      raw += decoder.decode();
      let parsed: unknown;
      try { parsed = JSON.parse(raw); }
      catch { return Response.json({ success: false, error: "invalid_body" }, { status: 400 }); }
      const body = hbsyncMarketBodySchema.safeParse(parsed);
      if (!body.success) return Response.json({ success: false, error: "invalid_body" }, { status: 400 });
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { importHbsyncMarket } = await import("@/lib/market/hbsync.server");
      const result = await importHbsyncMarket(supabaseAdmin, body.data.listings);
      return Response.json(result, { status: result.success ? 200 : 422 });
    } catch {
      return Response.json({ success: false, error: "import_failed" }, { status: 500 });
    }
  } } },
});