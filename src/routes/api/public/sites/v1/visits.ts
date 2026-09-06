// POST /api/public/sites/v1/visits — site-ul conectat raportează vizualizări pe proprietate.
// GET  /api/public/sites/v1/visits — totalul vizualizărilor raportate, pe proprietate.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withFeedAuth, jsonResponse, errorResponse, FEED_API_VERSION } from "@/lib/site-feed/auth.server";

const visitSchema = z.object({
  id: z.string().uuid("id must be the property UUID"),
  views: z.number().int().min(0).max(1_000_000).default(1),
  source: z.string().trim().max(60).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
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
            const source = entry.source ?? null;
            const existing = await supabaseAdmin
              .from("site_feed_visits")
              .select("id, views")
              .eq("organization_id", auth.organizationId)
              .eq("property_id", entry.id)
              .eq("occurred_on", occurredOn)
              .is("source", source)
              .maybeSingle();

            if (existing.data) {
              await supabaseAdmin
                .from("site_feed_visits")
                .update({ views: (existing.data.views ?? 0) + entry.views })
                .eq("id", existing.data.id);
            } else {
              await supabaseAdmin.from("site_feed_visits").insert({
                organization_id: auth.organizationId,
                property_id: entry.id,
                views: entry.views,
                source,
                occurred_on: occurredOn,
              });
            }
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
