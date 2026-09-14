/**
 * Stratul de abstracție pentru providerul AI.
 *
 * Un singur provider este implementat acum (Lovable AI Gateway, server-side),
 * dar interfața permite schimbarea lui ulterioară fără să atingem fluxul ACP.
 * Cheia trăiește exclusiv în variabilele de mediu ale serverului și nu ajunge
 * niciodată în bundle-ul clientului.
 */
import type { AcpAiContext } from "./context";
import { ACP_AI_PROMPT_VERSION, ACP_AI_SYSTEM_PROMPT, buildAcpAiUserPrompt } from "./prompt";

export type AiProvider = {
  /** Identificator scurt al providerului, salvat în audit. */
  readonly id: string;
  /** Modelul folosit, salvat în `acp_analyses.ai_model`. */
  readonly model: string;
  /** Versiunea promptului folosit, salvată pentru reproductibilitate. */
  readonly promptVersion: string;
  /** Returnează textul brut generat de model. */
  generate(context: AcpAiContext): Promise<string>;
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";

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

/** Erori de provider, convertite mai sus în mesaje sigure pentru utilizator. */
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

/** Citește textul final din fluxul SSE al Responses API. */
async function readOutputText(response: Response): Promise<string> {
  const body = response.body;
  if (!body) throw new AiProviderError("Providerul AI nu a returnat niciun răspuns.");
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let out = "";
  let completed = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "" || payload === "[DONE]") continue;
      let event: {
        type?: string;
        delta?: string;
        response?: { output_text?: string };
      };
      try {
        event = JSON.parse(payload);
      } catch {
        continue;
      }
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        out += event.delta;
      } else if (event.type === "response.completed" && event.response?.output_text) {
        completed = event.response.output_text;
      }
    }
  }
  return out.trim() !== "" ? out : completed;
}

function createLovableGatewayProvider(apiKey: string): AiProvider {
  return {
    id: "lovable-ai-gateway",
    model: MODEL,
    promptVersion: ACP_AI_PROMPT_VERSION,
    async generate(context) {
      const response = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({
          model: MODEL,
          stream: true,
          instructions: ACP_AI_SYSTEM_PROMPT,
          input: buildAcpAiUserPrompt(context),
          reasoning: { effort: "low" },
          text: {
            format: {
              type: "json_schema",
              name: "acp_ai_insight",
              strict: true,
              schema: RESPONSE_SCHEMA,
            },
          },
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new AiProviderError(
          `Providerul AI a răspuns cu ${response.status}: ${detail.slice(0, 400)}`,
          response.status,
          response.status === 429 || response.status >= 500,
        );
      }

      return await readOutputText(response);
    },
  };
}

/** `true` dacă providerul AI este configurat pe server. */
export function isAcpAiConfigured(): boolean {
  return Boolean(process.env["LOVABLE_API_KEY"]);
}

/** Providerul activ sau `null` când secretul nu este configurat. */
export function resolveAcpAiProvider(): AiProvider | null {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return null;
  return createLovableGatewayProvider(apiKey);
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
    if (error.retryable) {
      return "Serviciul AI este temporar indisponibil. Încearcă din nou.";
    }
    return "Serviciul AI nu a putut genera interpretarea pentru această analiză.";
  }
  return "Serviciul AI nu a putut genera interpretarea pentru această analiză.";
}
