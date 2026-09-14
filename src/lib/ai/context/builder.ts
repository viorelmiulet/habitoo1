/**
 * Context builder — funcție pură.
 *
 * AI-ul primește numai datele necesare cererii, pe categorii explicite, cu
 * câmpuri pe listă albă și texte sanitizate. Nu trimitem niciodată întreaga
 * bază de date, nici câmpuri interne, tokenuri sau date personale în plus.
 */
import { sanitizeCrmText } from "../security/injection";

export const AI_CONTEXT_CATEGORIES = [
  "property",
  "client",
  "lead",
  "acp",
  "activity",
  "document",
] as const;

export type AiContextCategory = (typeof AI_CONTEXT_CATEGORIES)[number];

export const AI_CONTEXT_VERSION = "habitoo-ai-context-1";

export type AiContextInput = {
  organizationName?: string | null;
  now?: string;
  property?: Record<string, unknown> | null;
  client?: Record<string, unknown> | null;
  lead?: Record<string, unknown> | null;
  acp?: Record<string, unknown> | null;
  activity?: Record<string, unknown>[] | null;
  document?: Record<string, unknown>[] | null;
};

export type AiContext = {
  contextVersion: string;
  organization: string | null;
  now: string;
  categories: AiContextCategory[];
  data: Partial<Record<AiContextCategory, unknown>>;
};

/** Câmpurile permise pe categorie. Orice alt câmp este eliminat. */
export const AI_CONTEXT_FIELDS: Record<AiContextCategory, readonly string[]> = {
  property: [
    "id",
    "reference",
    "title",
    "propertyType",
    "transaction",
    "status",
    "city",
    "county",
    "district",
    "rooms",
    "usableSurface",
    "floor",
    "buildYear",
    "price",
    "currency",
    "pricePerSqm",
    "archived",
  ],
  client: ["id", "name", "type", "status", "city", "source", "tags", "notes"],
  lead: ["id", "name", "stage", "score", "source", "value", "propertyId", "nextFollowupAt"],
  acp: [
    "id",
    "propertyId",
    "version",
    "status",
    "estimatedValue",
    "estimatedMin",
    "estimatedMax",
    "recommendedListingPrice",
    "confidenceScore",
    "comparablesUsed",
    "snapshotAt",
  ],
  activity: ["id", "type", "subject", "status", "dueAt", "completedAt"],
  document: ["id", "name", "kind", "createdAt"],
};

function pick(source: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (!(field in source)) continue;
    const value = source[field];
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      const clean = sanitizeCrmText(value);
      if (clean) out[field] = clean;
      continue;
    }
    if (Array.isArray(value)) {
      const items = value
        .map((item) => (typeof item === "string" ? sanitizeCrmText(item) : item))
        .filter((item) => item !== null && item !== undefined);
      if (items.length > 0) out[field] = items.slice(0, 20);
      continue;
    }
    out[field] = value;
  }
  return out;
}

/** Construiește contextul restrâns pentru o cerere AI. */
export function buildAiContext(input: AiContextInput): AiContext {
  const data: Partial<Record<AiContextCategory, unknown>> = {};
  const categories: AiContextCategory[] = [];

  for (const category of AI_CONTEXT_CATEGORIES) {
    const raw = input[category];
    if (!raw) continue;
    const fields = AI_CONTEXT_FIELDS[category];
    if (Array.isArray(raw)) {
      const items = raw.slice(0, 10).map((item) => pick(item, fields));
      const filled = items.filter((item) => Object.keys(item).length > 0);
      if (filled.length === 0) continue;
      data[category] = filled;
    } else {
      const item = pick(raw as Record<string, unknown>, fields);
      if (Object.keys(item).length === 0) continue;
      data[category] = item;
    }
    categories.push(category);
  }

  return {
    contextVersion: AI_CONTEXT_VERSION,
    organization: sanitizeCrmText(input.organizationName ?? null, 80),
    now: input.now ?? new Date().toISOString(),
    categories,
    data,
  };
}
