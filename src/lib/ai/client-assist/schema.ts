import { z } from "zod";
import { evidencedChanges } from "../lead-assist/evidence";
import { leadAiResponseSchema, type ProposedChange, type RequestLike } from "../lead-assist/schema";

export const entitySchema = z.object({ kind: z.enum(["contact", "lead"]), id: z.string().uuid() });
export type ClientEntity = z.infer<typeof entitySchema>;
export type HistoryFact = { id: string; label: string; text: string };
const excerptSchema = z.object({ id: z.string(), excerpt: z.string().trim().min(1).max(700) }).strict();
export const summarySchema = z.object({ facts: z.array(excerptSchema).min(1).max(8), next: z.enum(["clarify", "followup", "viewing"]) }).strict();
const nextSteps = {
  clarify: "Următorul pas recomandat: clarifică preferințele clientului.",
  followup: "Următorul pas recomandat: contactează clientul pentru a confirma cerințele actuale.",
  viewing: "Următorul pas recomandat: discută cu clientul despre o posibilă vizionare.",
};

/** Extractive summary: no model-generated factual sentences can reach the UI. */
export function validateSummary(raw: unknown, history: HistoryFact[]): string | null {
  const parsed = summarySchema.safeParse(raw);
  if (!parsed.success) return null;
  const selected = parsed.data.facts.map(f => {
    const source = history.find(h => h.id === f.id);
    const sentences = source?.text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()) ?? [];
    return sentences.includes(f.excerpt) ? `${source?.label}: ${f.excerpt}` : null;
  });
  if (selected.some(s => s === null)) return null;
  return `${[...new Set(selected)].join(" ")} ${nextSteps[parsed.data.next]}`;
}

export const callResponseSchema = z.object({
  transcript: z.string().trim().min(1).max(12000),
  activity: z.string().trim().min(1).max(700).nullable(),
  followup: z.object({ excerpt: z.string().trim().min(1).max(700), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }).strict().nullable(),
  request: leadAiResponseSchema.shape.request,
}).strict();
export type CallChange = Omit<ProposedChange, "value"> & { value: string | number | boolean | string[] };
export type CallProposal = { transcript: string; activity: string | null; followup: { excerpt: string; date: string | null } | null; changes: CallChange[] };
export type AnalyzedCall = CallProposal & { organizationId: string };

/** Dates are accepted only when explicitly dictated, not inferred by the model. */
export function dateFromEvidence(excerpt: string): string | null {
  const match = excerpt.match(/\b(\d{4})-(\d{2})-(\d{2})\b/) ?? excerpt.match(/\b(\d{2})[./](\d{2})[./](\d{4})\b/);
  if (!match) return null;
  const date = match[1]?.length === 4 ? `${match[1]}-${match[2]}-${match[3]}` : `${match[3]}-${match[2]}-${match[1]}`;
  return !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date ? date : null;
}

export function validateCall(raw: unknown, existing: RequestLike = {}): CallProposal | null {
  const parsed = callResponseSchema.safeParse(raw);
  if (!parsed.success) return null;
  const value = parsed.data;
  const followup = value.followup && value.transcript.includes(value.followup.excerpt) ? { excerpt: value.followup.excerpt, date: dateFromEvidence(value.followup.excerpt) } : null;
  return {
    transcript: value.transcript,
    activity: value.activity && value.transcript.includes(value.activity) ? value.activity : null,
    followup,
    changes: evidencedChanges(existing, value.request, value.transcript).flatMap(c => {
      const v = c.value;
      return typeof v === "string" || typeof v === "number" || typeof v === "boolean" || (Array.isArray(v) && v.every((item: unknown) => typeof item === "string")) ? [{ ...c, value: v as string | number | boolean | string[] }] : [];
    }),
  };
}

/** Confirmation may contain only individually selected, revalidated source-backed fields. */
export function confirmedChanges(source: string, raw: unknown, fields: string[], existing: RequestLike): ProposedChange[] {
  const parsed = leadAiResponseSchema.shape.request.safeParse(raw);
  if (!parsed.success || !fields.length) return [];
  return evidencedChanges(existing, parsed.data, source).filter(c => fields.includes(c.field));
}