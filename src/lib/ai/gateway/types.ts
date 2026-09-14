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
  type: "property" | "contact" | "lead" | "acp";
  id: string;
  label: string;
};

export type AiToolCallRecord = {
  name: string;
  arguments: Record<string, unknown>;
  ok: boolean;
  durationMs: number;
  /** Rezumat scurt al rezultatului; nu conține date sensibile brute. */
  summary: string;
  error?: string;
};

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
