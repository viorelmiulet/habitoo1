/**
 * Endpoint public pentru ingestia anunțurilor de la scraper.
 *
 * POST /api/public/listings/upsert
 * Header obligatoriu: x-scraper-secret (comparat cu SCRAPER_SECRET).
 * Body: { "listings": [ { source, external_id, ... } ] }
 * Face upsert în `listings` pe (source, external_id) și returnează
 * { success: true, inserted: <număr procesat> }.
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { z } from "zod";

const MAX_LISTINGS_PER_CALL = 500;

const listingSchema = z.object({
  source: z.enum(["storia", "imobiliare", "olx"]),
  external_id: z.string().min(1).max(200),
  title: z.string().max(500).nullish(),
  price: z.number().nonnegative().nullish(),
  currency: z.string().max(8).nullish(),
  price_per_m2: z.number().nonnegative().nullish(),
  rooms: z.number().int().nonnegative().nullish(),
  surface: z.number().nonnegative().nullish(),
  floor: z.string().max(50).nullish(),
  location: z.string().max(300).nullish(),
  county: z.string().max(100).nullish(),
  property_type: z.string().max(100).nullish(),
  transaction_type: z.string().max(50).nullish(),
  is_owner: z.boolean().nullish(),
  owner_type: z.string().max(50).nullish(),
  description: z.string().max(20_000).nullish(),
  phone: z.string().max(50).nullish(),
  url: z.string().url().max(2000).nullish(),
  images: z.array(z.string().url().max(2000)).max(50).nullish(),
  fingerprint: z.string().max(200).nullish(),
  scraped_at: z.string().datetime({ offset: true }).nullish(),
  published_at: z.string().datetime({ offset: true }).nullish(),
  raw_data: z.record(z.unknown()).nullish(),
});

const bodySchema = z.object({
  listings: z.array(listingSchema).min(1).max(MAX_LISTINGS_PER_CALL),
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/listings/upsert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["SCRAPER_SECRET"];
        if (!expected) {
          console.error("[listings-upsert] SCRAPER_SECRET is not configured");
          return json({ success: false, error: "server_misconfigured" }, 500);
        }
        const provided = request.headers.get("x-scraper-secret") ?? "";
        if (!provided || !secretMatches(provided, expected)) {
          return json({ success: false, error: "unauthorized" }, 401);
        }

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ success: false, error: "invalid_json" }, 400);
        }
        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return json(
            { success: false, error: "invalid_body", details: parsed.error.issues.slice(0, 5) },
            400,
          );
        }

        const rows = parsed.data.listings.map((listing) => {
          const row: Record<string, unknown> = {
            source: listing.source,
            external_id: listing.external_id,
          };
          for (const [key, value] of Object.entries(listing)) {
            if (key === "source" || key === "external_id") continue;
            if (value !== undefined) row[key] = value;
          }
          return row;
        });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("listings")
          .upsert(rows as never, { onConflict: "source,external_id" });

        if (error) {
          console.error(`[listings-upsert] upsert failed: ${error.message}`);
          return json({ success: false, error: "upsert_failed" }, 500);
        }

        return json({ success: true, inserted: rows.length });
      },
    },
  },
});
