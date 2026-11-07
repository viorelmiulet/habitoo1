import { z } from "zod";
import { isVisitDateAcceptable } from "./mapper";
import { errorResponse, jsonResponse, FEED_API_VERSION, type FeedAuthOk } from "./auth.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedHandlerResult } from "./handlers.server";

export const visitSchema = z.object({
  id: z.string().uuid("id must be the property UUID"), views: z.number().int().min(0).max(1_000_000).default(1),
  source: z.string().trim().max(60).optional(),
  date: z.string().refine(isVisitDateAcceptable, "date must be a real date within the accepted window").optional(),
  event_id: z.string().trim().min(1).max(200).optional(),
});
export const visitPayloadSchema = z.union([visitSchema, z.object({visits: z.array(visitSchema).min(1).max(500)})]);

export async function handleVisitsPost(db: SupabaseClient, auth: FeedAuthOk, body: unknown): Promise<FeedHandlerResult> {
  const parsed = visitPayloadSchema.safeParse(body);
  if (!parsed.success) return {response: errorResponse(422, "Invalid payload."), items: 0};
  const entries = "visits" in parsed.data ? parsed.data.visits : [parsed.data];
  const {data: owned, error} = await db.from("properties").select("id").eq("organization_id", auth.organizationId).in("id", [...new Set(entries.map(e => e.id))]);
  if (error) throw error;
  const allowed = new Set((owned ?? []).map(p => p.id));
  let accepted = 0;
  let duplicates = 0;
  const hasEvent = entries.some(e => e.event_id !== undefined);
  for (const entry of entries) {
    if (!allowed.has(entry.id)) continue;
    const args = {_org: auth.organizationId, _property: entry.id, _views: entry.views, _source: entry.source ?? "", _occurred_on: entry.date ?? new Date().toISOString().slice(0, 10)};
    const result = entry.event_id
      ? await db.rpc("site_feed_record_visit_event", {...args, _identity: auth.portal ? `portal:${auth.portal}` : `site:${auth.tokenId}`, _event_id: entry.event_id})
      : await db.rpc("site_feed_record_visit", args);
    if (result.error) throw result.error;
    if (entry.event_id && result.data === true) duplicates += 1;
    accepted += 1;
  }
  return {response: jsonResponse({accepted, rejected: entries.length - accepted,
    ...(hasEvent ? {deduplicated: duplicates > 0, duplicates} : {}), api_version: FEED_API_VERSION}, accepted > 0 ? 200 : 404), items: accepted};
}