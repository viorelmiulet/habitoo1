/**
 * Schema răspunsului AI și validarea lui. Nimic din afara acestei scheme nu
 * ajunge salvat ca dată structurată: dacă providerul returnează text invalid,
 * folosim un fallback sigur, nu conținut arbitrar.
 */
import { z } from "zod";

const text = z.string().trim().min(1).max(4000);
const list = z.array(z.string().trim().min(1).max(600)).max(10);

export const acpAiInsightSchema = z.object({
  executive_summary: text,
  market_assessment: text,
  comparable_analysis: text,
  price_recommendation_explanation: text,
  risk_factors: list,
  data_quality_notes: list,
  key_observations: list,
});

export type AcpAiInsight = z.infer<typeof acpAiInsightSchema>;

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
