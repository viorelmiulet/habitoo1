/** ACP interpretation uses the shared server-only registry; the engine stays deterministic. */
import type { AcpAiContext } from "./context";
import { ACP_AI_PROMPT_VERSION, ACP_AI_SYSTEM_PROMPT, buildAcpAiUserPrompt } from "./prompt";
import { parseAcpAiInsight } from "./schema";
import { resolveAiProvider } from "@/lib/ai/providers/registry.server";
import { withAiProviderFallback } from "@/lib/ai/providers/fallback.server";
import { withRetry } from "@/lib/ai/reliability/retry";
import { AiProviderError } from "@/lib/ai/providers/types";
export { AiProviderError } from "@/lib/ai/providers/types";

export type AiProvider = {
  readonly id: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly fallbackUsed: boolean;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly calls: number;
  generate(context: AcpAiContext): Promise<string>;
};

const STRING_LIST = {
  type: "array",
  items: { type: "string" },
} as const;

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    executive_summary: { type: "string" },
    valuation_explanation: { type: "string" },
    market_context: { type: "string" },
    comparable_analysis: { type: "string" },
    key_drivers: STRING_LIST,
    risks_and_limitations: STRING_LIST,
    recommended_positioning: { type: "string" },
    confidence_explanation: { type: "string" },
    client_friendly_summary: { type: "string" },
  },
  required: [
    "executive_summary",
    "valuation_explanation",
    "market_context",
    "comparable_analysis",
    "key_drivers",
    "risks_and_limitations",
    "recommended_positioning",
    "confidence_explanation",
    "client_friendly_summary",
  ],
} as const;

/** The registry reads private configuration only on the server. */
export function isAcpAiConfigured(): boolean {
  return resolveAiProvider() !== null;
}

export function resolveAcpAiProvider(): AiProvider | null {
  const primary = resolveAiProvider();
  if (!primary) return null;
  let actual = primary;
  let fallbackUsed = primary.id === "gemini";
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let calls = 0;
  return {
    get id() { return actual.id; },
    get model() { return actual.model; },
    promptVersion: ACP_AI_PROMPT_VERSION,
    get fallbackUsed() { return fallbackUsed; },
    get inputTokens() { return inputTokens; },
    get outputTokens() { return outputTokens; },
    get calls() { return calls; },
    async generate(context) {
      const completed = await withAiProviderFallback(primary, async (provider) => {
        actual = provider;
        fallbackUsed = provider.id === "gemini";
        inputTokens = null;
        outputTokens = null;
        calls = 0;
        const system = `${ACP_AI_SYSTEM_PROMPT}\nÎntoarce un singur obiect JSON cu exact cele 9 chei din această schemă, fără text în afara lui: ${JSON.stringify(RESPONSE_SCHEMA)}`;
        const user = buildAcpAiUserPrompt(context);
        let raw = "";
        // Format correction is distinct from transient network retries: at most two answers.
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const answer = await withRetry(() => {
            calls += 1;
            return provider.generate({
              system,
              messages: [{ role: "user", content: attempt === 0 ? user : `${user}\nRăspunsul anterior nu a respectat schema. Întoarce acum exclusiv obiectul JSON valid cu exact cele 9 chei obligatorii.` }],
              tools: [],
            });
          });
          inputTokens = answer.inputTokens === null ? inputTokens : (inputTokens ?? 0) + answer.inputTokens;
          outputTokens = answer.outputTokens === null ? outputTokens : (outputTokens ?? 0) + answer.outputTokens;
          raw = answer.text;
          if (parseAcpAiInsight(raw).ok) break;
        }
        return raw;
      });
      fallbackUsed = completed.fallbackUsed;
      return completed.result;
    },
  };
}

/** Traduce eroarea providerului într-un mesaj sigur pentru utilizator. */
export function safeAiErrorMessage(error: unknown): string {
  if (error instanceof AiProviderError) {
    if (error.status === 429) {
      return "Serviciul AI este momentan aglomerat. Încearcă din nou în câteva minute.";
    }
    if (error.status === 402) {
      return "Creditele AI ale spațiului de lucru s-au epuizat. Adaugă credite pentru a genera interpretarea.";
    }
    if (error.status === 401 || error.status === 403) {
      return "Analiza AI indisponibilă — providerul nu este configurat corect.";
    }
    if (error.status === 504) {
      return "Serviciul AI nu a răspuns în timp util. Încearcă din nou.";
    }
    if (error.retryable) {
      return "Serviciul AI este temporar indisponibil. Încearcă din nou.";
    }
    return "Serviciul AI nu a putut genera interpretarea pentru această analiză.";
  }
  return "Serviciul AI nu a putut genera interpretarea pentru această analiză.";
}
