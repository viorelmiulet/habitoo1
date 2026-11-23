/**
 * Analiza AI a unui mesaj primit pe un lead: rulează din coada `lead_ai_insights`
 * (după primirea mesajului, niciodată în calea ei). Nu trimite nimic clientului.
 * Propune o cerere/diferențe; numai confirmarea agentului poate modifica cereri.
 */
import type { AIProvider } from "@/lib/ai/providers/types";
import { parseJsonLoose } from "@/lib/ai/listing-autofill/autofill.server";
import {
  buildLeadAiRequest, leadAiResponseSchema, groundedLeadDraft, validatedLeadDraft, sanitizeExtraction,
  type DraftProperty, type ExtractedRequest,
} from "./schema";
import { evidencedChanges } from "./evidence";
import { qualifyLead } from "./qualification";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;
type Credits = <T>(actor: { organizationId: string; userId: string }, run: () => Promise<T>, isSuccess: (r: T) => boolean) => Promise<T>;

export type LeadAiDeps = {
  db: Db;
  provider: AIProvider | null;
  isFeatureEnabled: (organizationId: string) => Promise<boolean>;
  withCredits: Credits;
  readDb?: Db;
  recordUsage?: (actor: { organizationId: string; userId: string }, usage: { inputTokens: number | null; outputTokens: number | null; success: boolean }) => Promise<void>;
};

export type InsightRow = { id: string; organization_id: string; lead_id: string; message_id: string | null; source_kind?: string; source_text?: string | null };
export type ProcessOutcome = "done" | "skipped" | "failed";

const PROPERTY_COLUMNS = "title,transaction_kind,property_type,price,currency,rooms,surface,usable_surface,floor,city,balcony,parking,description,status";

async function finish(db: Db, id: string, patch: Record<string, unknown>) {
  await db.from("lead_ai_insights").update({ ...patch, locked_until: null, updated_at: new Date().toISOString() }).eq("id", id);
}

type Analysis = { ok: true; extracted: ExtractedRequest; intent: string; language: string | null; draft: string | null } | { ok: false };

async function analyze(provider: AIProvider, message: string, property: DraftProperty | null, history: { direction: string; body: string }[], usage?: (value: { inputTokens: number | null; outputTokens: number | null; success: boolean }) => Promise<void>): Promise<Analysis> {
  const result = await provider.generate(buildLeadAiRequest({ message, property, history }));
  const parsed = leadAiResponseSchema.safeParse(parseJsonLoose(result.text));
  await usage?.({ inputTokens: result.inputTokens ?? null, outputTokens: result.outputTokens ?? null, success: parsed.success });
  if (!parsed.success) return { ok: false };
  return {
    ok: true,
    extracted: sanitizeExtraction(parsed.data.request, message),
    intent: parsed.data.intent,
    language: parsed.data.language ?? null,
    draft: validatedLeadDraft(parsed.data.draft, property) ?? groundedLeadDraft(property),
  };
}

/** Încarcă contextul (doar acest lead), rulează AI-ul cu credite și salvează rezultatul. */
export async function processLeadInsight(deps: LeadAiDeps, row: InsightRow, options: { regenerate?: boolean; actorUserId?: string } = {}): Promise<ProcessOutcome> {
  const db = deps.readDb ?? deps.db;
  const { data: lead } = await db.from("leads")
    .select("id,organization_id,name,assigned_to,contact_id,request_id,property_id,deleted_at,notes")
    .eq("id", row.lead_id).maybeSingle();
  if (!lead || lead.deleted_at || lead.organization_id !== row.organization_id) {
    await finish(deps.db, row.id, { status: "skipped", skip_reason: "lead_missing" });
    return "skipped";
  }
  if (!(await deps.isFeatureEnabled(row.organization_id))) {
    await finish(deps.db, row.id, { status: "skipped", skip_reason: "feature_disabled" });
    return "skipped";
  }
  if (!deps.provider) {
    await finish(deps.db, row.id, { status: "skipped", skip_reason: "not_configured" });
    return "skipped";
  }
  const message = row.message_id
    ? (await db.from("portal_messages").select("id,body,direction,property_id,lead_id,sent_at").eq("id", row.message_id).eq("organization_id", row.organization_id).maybeSingle()).data
    : { body: lead.notes ?? "", direction: "in", property_id: lead.property_id, lead_id: lead.id };
  if (!message?.body || message.direction !== "in" || message.lead_id !== row.lead_id) {
    // A lead without a message can still prepare a property-grounded reply.
    if (row.message_id) {
      await finish(deps.db, row.id, { status: "skipped", skip_reason: "message_missing" });
      return "skipped";
    }
  }
  const source = String(message?.body ?? "");
  const propertyId = message?.property_id ?? lead.property_id;
  const property: DraftProperty | null = propertyId
    ? ((await db.from("properties").select(PROPERTY_COLUMNS).eq("id", propertyId).eq("organization_id", row.organization_id).maybeSingle()).data ?? null)
    : null;
  const prior: { direction: string; body: string | null; sent_at: string | null }[] = [];
  for (let offset = 0; ; offset += 500) {
    const r = await db.from("portal_messages").select("direction,body,sent_at").eq("lead_id", row.lead_id)
      .eq("organization_id", row.organization_id).order("sent_at", { ascending: true }).range(offset, offset + 499);
    if (r.error) throw new Error("Conversația nu a putut fi încărcată.");
    prior.push(...r.data ?? []); if ((r.data?.length ?? 0) < 500) break;
  }
  const history = prior.slice(-5).flatMap(m => m.body ? [{ direction: m.direction, body: m.body }] : []);

  const actorUserId = options.actorUserId ?? lead.assigned_to;
  if (!actorUserId) { await finish(deps.db, row.id, { status: "skipped", skip_reason: "agent_missing" }); return "skipped"; }
  const actor = { organizationId: row.organization_id, userId: actorUserId };
  let analysis: Analysis;
  try {
    const provider = deps.provider;
    analysis = await deps.withCredits(actor, () => analyze(provider, source, property, history, deps.recordUsage ? u => deps.recordUsage?.(actor, u) ?? Promise.resolve() : undefined), (r) => r.ok);
  } catch (error) {
    if (error instanceof Error && error.name === "AiCreditsExhaustedError") {
      await finish(deps.db, row.id, { status: "skipped", skip_reason: "no_credits" });
      return "skipped";
    }
    throw error;
  }
  if (!analysis.ok) {
    await finish(deps.db, row.id, { status: "failed", skip_reason: "invalid_response" });
    return "failed";
  }

  const existing = lead.request_id ? (await db.from("requests").select("*").eq("id", lead.request_id).eq("organization_id", row.organization_id).maybeSingle()).data : null;
  const qualification = qualifyLead(source, analysis.extracted, property, prior);
  const patch: Record<string, unknown> = {
    status: "done", skip_reason: null, intent: analysis.intent, extracted: analysis.extracted,
    draft: analysis.draft, draft_language: analysis.language,
    source_text: source, source_kind: row.message_id ? "message" : row.source_kind ?? "lead",
    score: qualification.score, score_reason: qualification.reason,
    request_id: lead.request_id, request_created: false, changes_applied_at: null,
    proposed_changes: evidencedChanges(existing ?? {}, analysis.extracted, source),
  };
  await finish(deps.db, row.id, patch);
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
