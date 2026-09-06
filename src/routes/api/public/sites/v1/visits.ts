// POST /api/public/sites/v1/visits — site-ul conectat raportează vizualizări pe proprietate.
// GET  /api/public/sites/v1/visits — totalul vizualizărilor raportate, pe proprietate.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withFeedAuth, jsonResponse, errorResponse, FEED_API_VERSION } from "@/lib/site-feed/auth.server";
import { isVisitDateAcceptable } from "@/lib/site-feed/mapper";

const visitSchema = z.object({
  id: z.string().uuid("id must be the property UUID"),
  views: z.number().int().min(0).max(1_000_000).default(1),
  source: z.string().trim().max(60).optional(),
  // Dată calendaristică reală (nu doar regex): 2026-99-99 este respinsă.
  date: z.string().refine(isVisitDateAcceptable, "date must be a real date within the accepted window").optional(),
});

const payloadSchema = z.union([visitSchema, z.object({ visits: z.array(visitSchema).min(1).max(500) })]);

export const Route = createFileRoute("/api/public/sites/v1/visits")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withFeedAuth(request, "visits", async (auth) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin
            .from("site_feed_visits")
            .select("property_id, views, occurred_on, source")
            .eq("organization_id", auth.organizationId)
            .order("occurred_on", { ascending: false })
            .limit(1000);
          if (error) throw error;
          const totals = new Map<string, number>();
          for (const row of data ?? []) {
            totals.set(row.property_id, (totals.get(row.property_id) ?? 0) + (row.views ?? 0));
          }
          const items = [...totals.entries()].map(([id, views]) => ({ id, views }));
          return {
            response: jsonResponse({ data: items, api_version: FEED_API_VERSION }),
            items: items.length,
          };
        }),

      POST: async ({ request }) =>
        withFeedAuth(request, "visits", async (auth) => {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            return { response: errorResponse(400, "Invalid JSON body."), items: 0 };
          }
          const parsed = payloadSchema.safeParse(body);
          if (!parsed.success) {
            return { response: errorResponse(422, "Invalid payload."), items: 0 };
          }
          const entries = "visits" in parsed.data ? parsed.data.visits : [parsed.data];

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // Tenant isolation: doar proprietățile agenției din token pot primi vizualizări.
          const ids = [...new Set(entries.map((e) => e.id))];
          const { data: owned, error: ownedError } = await supabaseAdmin
            .from("properties")
            .select("id")
            .eq("organization_id", auth.organizationId)
            .in("id", ids);
          if (ownedError) throw ownedError;
          const allowed = new Set((owned ?? []).map((p) => p.id));

          let accepted = 0;
          for (const entry of entries) {
            if (!allowed.has(entry.id)) continue;
            const occurredOn = entry.date ?? new Date().toISOString().slice(0, 10);
            // Increment atomic în DB (INSERT ... ON CONFLICT DO UPDATE): două cereri
            // simultane nu pierd incrementări și nu lovesc indexul unic.
            const { error: rpcError } = await supabaseAdmin.rpc("site_feed_record_visit", {
              _org: auth.organizationId,
              _property: entry.id,
              _views: entry.views,
              _source: entry.source ?? null,
              _occurred_on: occurredOn,
            });
            if (rpcError) throw rpcError;
            accepted += 1;
          }

          return {
            response: jsonResponse(
              { accepted, rejected: entries.length - accepted, api_version: FEED_API_VERSION },
              accepted > 0 ? 200 : 404,
            ),
            items: accepted,
          };
        }),
    },
  },
});
