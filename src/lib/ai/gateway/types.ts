/**
 * Contractele publice ale AI Gateway (Stage 11A).
 *
 * Tot ce iese din gateway către interfață trece prin `AIResponse`: răspuns,
 * tool-uri folosite, context, surse, sugestii, avertismente și încredere.
 * Nimic nu se întoarce „nemonitorizabil": fiecare răspuns spune pe ce date
 * s-a bazat.
 */
import type { AiContextCategory } from "../context/builder";

export type AiRole = "agent" | "admin" | "superadmin";

/** Actorul verificat server-side: niciodată construit din inputul clientului. */
export type AiActor = {
  userId: string;
  organizationId: string;
  role: AiRole;
};

export type AiSource = {
  type: "property" | "contact" | "lead" | "acp" | "prospect";
  id: string;
  label: string;
};

export type AiToolCallRecord = {
  name: string;
  /** Parametrii serializați (JSON), ca răspunsul să rămână urmăribil. */
  arguments: string;
  ok: boolean;
  durationMs: number;
  /** Rezumat scurt al rezultatului; nu conține date sensibile brute. */
  summary: string;
  error?: string;
};

/** Limite de mărime pentru ce se persistă în `ai_messages.tool_calls`. */
export const AI_TOOL_ARGUMENTS_MAX_CHARS = 1000;
export const AI_TOOL_SUMMARY_MAX_CHARS = 500;

export function truncateAiToolText(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** Scurtează argumentele și rezultatul înainte de persistare. */
export function truncateAiToolCall(record: AiToolCallRecord): AiToolCallRecord {
  return {
    ...record,
    arguments: truncateAiToolText(record.arguments, AI_TOOL_ARGUMENTS_MAX_CHARS),
    summary: truncateAiToolText(record.summary, AI_TOOL_SUMMARY_MAX_CHARS),
    ...(record.error ? { error: truncateAiToolText(record.error, AI_TOOL_SUMMARY_MAX_CHARS) } : {}),
  };
}

export type AiUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
};

export type AIResponse = {
  status: "ok" | "not_configured" | "rate_limited" | "failed";
  answer: string;
  toolCalls: AiToolCallRecord[];
  contextUsed: AiContextCategory[];
  sources: AiSource[];
  suggestions: string[];
  warnings: string[];
  confidence: "low" | "medium" | "high";
  conversationId: string | null;
  provider: string | null;
  model: string | null;
  usage: AiUsage | null;
  /** Mesaj sigur pentru utilizator când `status` nu este `ok`. */
  message?: string;
};

/** Cod stabil pentru lipsa configurării providerului AI. */
export const AI_NOT_CONFIGURED = "AI_NOT_CONFIGURED" as const;

export const AI_NOT_CONFIGURED_MESSAGE = "AI nu este configurat.";

/** Răspuns gol, folosit ca bază pentru orice rezultat al gateway-ului. */
export function emptyAiResponse(status: AIResponse["status"], message?: string): AIResponse {
  return {
    status,
    answer: "",
    toolCalls: [],
    contextUsed: [],
    sources: [],
    suggestions: [],
    warnings: [],
    confidence: "low",
    conversationId: null,
    provider: null,
    model: null,
    usage: null,
    ...(message ? { message } : {}),
  };
}
