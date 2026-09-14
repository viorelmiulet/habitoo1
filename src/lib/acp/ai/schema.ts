/**
 * Schema răspunsului AI (ACP Stage 5) și validarea lui.
 *
 * Nimic din afara acestei scheme nu ajunge salvat: dacă providerul returnează
 * text invalid, generarea eșuează controlat, fără să atingă cifrele motorului
 * determinist. Textul primit este și sanitizat (fără caractere de control,
 * fără blocuri de cod), ca să nu poată injecta formatare sau instrucțiuni în
 * interfață, în PDF sau într-un apel următor.
 */
import { z } from "zod";

/** Versiunea schemei, salvată alături de fiecare rezultat AI. */
export const ACP_AI_SCHEMA_VERSION = "acp-ai-insight-2";

/** Curăță textul generat: control chars, zero-width, backticks, spații redundante. */
export function sanitizeAiText(raw: string): string {
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/[\u200B-\u200F\u2028\u2029\uFEFF]/g, "")
    .replace(/`{1,3}/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const text = z
  .string()
  .transform(sanitizeAiText)
  .pipe(z.string().min(1).max(4000));

const list = z
  .array(z.string().transform(sanitizeAiText).pipe(z.string().min(1).max(600)))
  .max(10);

export const acpAiInsightSchema = z.object({
  executive_summary: text,
  valuation_explanation: text,
  market_context: text,
  comparable_analysis: text,
  key_drivers: list,
  risks_and_limitations: list,
  recommended_positioning: text,
  confidence_explanation: text,
  client_friendly_summary: text,
});

export type AcpAiInsight = z.infer<typeof acpAiInsightSchema>;

/** Metadatele unui rezultat AI, complet separate de cifrele deterministe. */
export type AcpAiInsightRecord = {
  id: string | null;
  insight: AcpAiInsight;
  provider: string | null;
  model: string | null;
  generatedAt: string | null;
  promptVersion: string | null;
  schemaVersion: string | null;
  analysisVersion: number | null;
  snapshotAt: string | null;
  /** `true` pentru interpretările generate înainte de Stage 5 (schema veche). */
  legacy: boolean;
};

/** Elimină eventualele blocuri de cod markdown din răspunsul providerului. */
export function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```[a-zA-Z]*\s*/, "")
    .replace(/```$/, "")
    .trim();
}

export type AcpAiParseResult =
  | { ok: true; insight: AcpAiInsight }
  | { ok: false; reason: "not_json" | "schema_mismatch" | "empty" };

/** Parsează și validează răspunsul providerului. Nu aruncă niciodată. */
export function parseAcpAiInsight(raw: string | null | undefined): AcpAiParseResult {
  if (!raw || raw.trim() === "") return { ok: false, reason: "empty" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch {
    return { ok: false, reason: "not_json" };
  }
  const result = acpAiInsightSchema.safeParse(parsed);
  if (!result.success) return { ok: false, reason: "schema_mismatch" };
  return { ok: true, insight: result.data };
}

/** Schema interpretărilor generate în faza 2, păstrate pentru compatibilitate. */
const legacyInsightSchema = z.object({
  executive_summary: z.string(),
  market_assessment: z.string(),
  comparable_analysis: z.string(),
  price_recommendation_explanation: z.string(),
  risk_factors: z.array(z.string()).default([]),
  data_quality_notes: z.array(z.string()).default([]),
  key_observations: z.array(z.string()).default([]),
});

/**
 * Citește o interpretare salvată (Stage 5 sau faza 2) și o aduce la schema
 * actuală, fără să inventeze conținut: câmpurile care nu existau în schema
 * veche sunt derivate exclusiv din textul deja generat atunci.
 */
export function readStoredAcpAiInsight(
  value: unknown,
): { insight: AcpAiInsight; legacy: boolean } | null {
  if (!value || typeof value !== "object") return null;
  const current = acpAiInsightSchema.safeParse(value);
  if (current.success) return { insight: current.data, legacy: false };

  const legacy = legacyInsightSchema.safeParse(value);
  if (!legacy.success) return null;
  const l = legacy.data;
  const mapped = acpAiInsightSchema.safeParse({
    executive_summary: l.executive_summary,
    valuation_explanation: l.price_recommendation_explanation,
    market_context: l.market_assessment,
    comparable_analysis: l.comparable_analysis,
    key_drivers: l.key_observations,
    risks_and_limitations: [...l.risk_factors, ...l.data_quality_notes].slice(0, 10),
    recommended_positioning: l.price_recommendation_explanation,
    confidence_explanation:
      l.data_quality_notes.join(" ") ||
      "Interpretare generată cu schema anterioară, fără explicație separată a scorului de încredere.",
    client_friendly_summary: l.executive_summary,
  });
  if (!mapped.success) return null;
  return { insight: mapped.data, legacy: true };
}
