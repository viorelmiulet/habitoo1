/**
 * Usage tracking pentru control de cost. Păstrăm doar ce oferă providerul:
 * tokenurile lipsă rămân `null`, nu le estimăm.
 */
export type AiUsageRow = {
  organization_id: string;
  user_id: string;
  provider: string;
  model: string;
  capability: string;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number;
  success: boolean;
  tool_calls: number;
  /** Marcaj explicit: providerul nu a raportat tokeni pentru această cerere. */
  tokens_unknown?: boolean;
};

type UsageWriter = {
  from: (table: "ai_usage_events") => {
    insert: (row: AiUsageRow) => Promise<{ error: { message: string } | null }>;
  };
};

/** Scrie un eveniment de utilizare (best-effort: nu blochează răspunsul). */
export async function writeAiUsage(client: UsageWriter, row: AiUsageRow): Promise<boolean> {
  const marked: AiUsageRow = {
    ...row,
    tokens_unknown:
      row.tokens_unknown ?? (row.input_tokens === null && row.output_tokens === null),
  };
  try {
    const { error } = await client.from("ai_usage_events").insert(marked);
    if (error) {
      console.error("[ai] usage insert failed", error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[ai] usage insert threw", error);
    return false;
  }
}

