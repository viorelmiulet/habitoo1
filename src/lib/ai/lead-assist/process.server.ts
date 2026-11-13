/**
 * Analiza AI a unui mesaj primit pe un lead: rulează din coada `lead_ai_insights`
 * (după primirea mesajului, niciodată în calea ei). Nu trimite nimic clientului.
 * Creează o cerere doar dacă lead-ul nu are una; altfel propune diferențe.
 */
import type { AIProvider } from "@/lib/ai/providers/types";
import { parseJsonLoose } from "@/lib/ai/listing-autofill/autofill.server";
import {
  buildLeadAiRequest, diffRequest, hasExtraction, leadAiResponseSchema, sanitizeDraft, sanitizeExtraction,
  type DraftProperty, type ExtractedRequest,
} from "./schema";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;
type Credits = <T>(actor: { organizationId: string; userId: string }, run: () => Promise<T>, isSuccess: (r: T) => boolean) => Promise<T>;

export type LeadAiDeps = {
  db: Db;
  provider: AIProvider | null;
  isFeatureEnabled: (organizationId: string) => Promise<boolean>;
  withCredits: Credits;
};

export type InsightRow = { id: string; organization_id: string; lead_id: string; message_id: string };
export type ProcessOutcome = "done" | "skipped" | "failed";

const PROPERTY_COLUMNS = "title,transaction_kind,property_type,price,currency,rooms,surface,usable_surface,floor,city,balcony,parking,description";

async function finish(db: Db, id: string, patch: Record<string, unknown>) {
  await db.from("lead_ai_insights").update({ ...patch, locked_until: null, updated_at: new Date().toISOString() }).eq("id", id);
}

function requestTitle(e: ExtractedRequest, leadName: string): string {
  const parts = [e.kind === "rent" ? "Închiriere" : "Cumpărare", e.rooms_min ? `${e.rooms_min} camere` : null, [...e.areas, ...e.cities][0] ?? null];
  return `${parts.filter(Boolean).join(" · ")} — ${leadName}`.slice(0, 200);
}

type Analysis = { ok: true; extracted: ExtractedRequest; intent: string; language: string | null; draft: string | null } | { ok: false };

async function analyze(provider: AIProvider, message: string, property: DraftProperty | null, history: { direction: string; body: string }[]): Promise<Analysis> {
  const result = await provider.generate(buildLeadAiRequest({ message, property, history }));
  const parsed = leadAiResponseSchema.safeParse(parseJsonLoose(result.text));
  if (!parsed.success) return { ok: false };
  const conversation = [message, ...history.map((h) => h.body)].join("\n");
  return {
    ok: true,
    extracted: sanitizeExtraction(parsed.data.request, message),
    intent: parsed.data.intent,
    language: parsed.data.language ?? null,
    draft: sanitizeDraft(parsed.data.draft, property, conversation),
  };
}

/** Încarcă contextul (doar acest lead), rulează AI-ul cu credite și salvează rezultatul. */
export async function processLeadInsight(deps: LeadAiDeps, row: InsightRow, options: { regenerate?: boolean; actorUserId?: string } = {}): Promise<ProcessOutcome> {
  const { db } = deps;
  const { data: lead } = await db.from("leads")
    .select("id,organization_id,name,assigned_to,contact_id,request_id,property_id,deleted_at")
    .eq("id", row.lead_id).maybeSingle();
  if (!lead || lead.deleted_at || lead.organization_id !== row.organization_id) {
    await finish(db, row.id, { status: "skipped", skip_reason: "lead_missing" });
    return "skipped";
  }
  if (!(await deps.isFeatureEnabled(row.organization_id))) {
    await finish(db, row.id, { status: "skipped", skip_reason: "feature_disabled" });
    return "skipped";
  }
  if (!deps.provider) {
    await finish(db, row.id, { status: "skipped", skip_reason: "not_configured" });
    return "skipped";
  }
  const { data: message } = await db.from("portal_messages").select("id,body,direction,property_id,lead_id").eq("id", row.message_id).maybeSingle();
  if (!message?.body || message.direction !== "in" || message.lead_id !== row.lead_id) {
    await finish(db, row.id, { status: "skipped", skip_reason: "message_missing" });
    return "skipped";
  }
  const propertyId = message.property_id ?? lead.property_id;
  const property: DraftProperty | null = propertyId
    ? ((await db.from("properties").select(PROPERTY_COLUMNS).eq("id", propertyId).eq("organization_id", row.organization_id).maybeSingle()).data ?? null)
    : null;
  const { data: prior } = await db.from("portal_messages").select("direction,body,sent_at")
    .eq("lead_id", row.lead_id).neq("id", row.message_id).order("sent_at", { ascending: false }).limit(5);
  const history = ((prior ?? []) as { direction: string; body: string | null }[])
    .filter((m) => m.body).reverse().map((m) => ({ direction: m.direction, body: m.body! }));

  const actor = { organizationId: row.organization_id, userId: options.actorUserId ?? lead.assigned_to ?? null };
  let analysis: Analysis;
  try {
    analysis = await deps.withCredits(actor as never, () => analyze(deps.provider!, message.body, property, history), (r) => r.ok);
  } catch (error) {
    if (error instanceof Error && error.name === "AiCreditsExhaustedError") {
      await finish(db, row.id, { status: "skipped", skip_reason: "no_credits" });
      return "skipped";
    }
    throw error;
  }
  if (!analysis.ok) {
    await finish(db, row.id, { status: "failed", skip_reason: "invalid_response" });
    return "failed";
  }

  const patch: Record<string, unknown> = {
    status: "done", skip_reason: null, intent: analysis.intent, extracted: analysis.extracted,
    draft: analysis.draft, draft_language: analysis.language,
  };
  if (options.regenerate) {
    await finish(db, row.id, { status: "done", draft: analysis.draft, draft_language: analysis.language, intent: analysis.intent });
    return "done";
  }
  if (hasExtraction(analysis.extracted)) {
    if (lead.request_id) {
      const { data: existing } = await db.from("requests").select("*").eq("id", lead.request_id).maybeSingle();
      patch.request_id = lead.request_id;
      patch.proposed_changes = existing ? diffRequest(existing, analysis.extracted) : [];
    } else {
      const kind = analysis.extracted.kind ?? (property ? (property.transaction_kind === "rent" ? "rent" : "buy") : null);
      if (kind) {
        const e = analysis.extracted;
        const { data: created, error } = await db.from("requests").insert({
          organization_id: row.organization_id, contact_id: lead.contact_id, assigned_to: lead.assigned_to,
          created_by: lead.assigned_to, kind, title: requestTitle({ ...e, kind }, lead.name), source: "ai_portal_message",
          budget_min: e.budget_min, budget_max: e.budget_max, currency: e.currency ?? "EUR", cities: e.cities, areas: e.areas,
          rooms_min: e.rooms_min, rooms_max: e.rooms_max, surface_min: e.surface_min, property_type: e.property_type,
          wants_parking: e.wants_parking, wants_balcony: e.wants_balcony, furnished: e.furnished, pets_allowed: e.pets_allowed, term: e.term,
        }).select("id").single();
        if (!error && created) {
          // Doar dacă între timp nu s-a atașat altă cerere.
          const { data: linked } = await db.from("leads").update({ request_id: created.id }).eq("id", lead.id).is("request_id", null).select("id");
          if (linked?.length) { patch.request_id = created.id; patch.request_created = true; }
          else await db.from("requests").delete().eq("id", created.id);
        }
      }
    }
  }
  await finish(db, row.id, patch);
  return "done";
}

/** Procesează un lot mărginit din coadă. */
export async function processLeadAiBatch(deps: LeadAiDeps, limit = 10): Promise<Record<ProcessOutcome, number>> {
  const counts: Record<ProcessOutcome, number> = { done: 0, skipped: 0, failed: 0 };
  const { data, error } = await deps.db.rpc("lead_ai_claim", { _limit: limit });
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as InsightRow[]) {
    try {
      counts[await processLeadInsight(deps, row)] += 1;
    } catch (e) {
      console.error("[lead_ai] item failed", e instanceof Error ? e.name : "error");
      // Rămâne „processing” cu lease; se reia după expirare (max 3 încercări).
      counts.failed += 1;
    }
  }
  return counts;
}
