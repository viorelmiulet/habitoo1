/**
 * GeminiProvider — prima implementare a abstracției `AIProvider`.
 *
 * Cheia trăiește exclusiv în variabilele de mediu ale serverului: nu ajunge
 * niciodată în bundle-ul clientului, în răspunsuri, în loguri sau în audit.
 */
import {
  AiProviderError,
  type AIProvider,
  type AiGenerateRequest,
  type AiGenerateResult,
  type AiProviderMessage,
  type AiToolDeclaration,
} from "./types";
import { parseGeminiResponse } from "./gemini.parse";

/**
 * Model implicit: `gemini-2.5-flash` a fost retras pentru cheile noi (404 cu
 * recomandarea explicită de migrare), deci folosim modelul flash actual.
 * Poate fi suprascris prin `GEMINI_MODEL`.
 */
export const GEMINI_DEFAULT_MODEL = "gemini-3.6-flash";
/**
 * Free tier: răspunsuri scurte, cost minim. Bugetul acoperă și tokenii de
 * raționament ai modelelor Gemini 3, de aceea nu este mai mic.
 */
export const GEMINI_MAX_OUTPUT_TOKENS = 2048;
export const GEMINI_TIMEOUT_MS = 60_000;
/** Raționament minim: latență și cost reduse pe free tier. */
export const GEMINI_THINKING_LEVEL = "low";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiContent = { role: "user" | "model"; parts: Record<string, unknown>[] };

/** Traduce mesajele neutre ale gateway-ului în formatul Gemini. */
export function toGeminiContents(messages: AiProviderMessage[]): GeminiContent[] {
  const contents: GeminiContent[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      contents.push({ role: "user", parts: [{ text: message.content }] });
    } else if (message.role === "assistant") {
      contents.push({ role: "model", parts: [{ text: message.content }] });
    } else if (message.role === "assistant_tool_call") {
      const part: Record<string, unknown> = {
        functionCall: { name: message.toolName, args: message.arguments },
      };
      // Gemini 3 refuză turul următor dacă semnătura nu este retrimisă.
      if (message.signature) part["thoughtSignature"] = message.signature;
      contents.push({ role: "model", parts: [part] });
    } else {
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: message.toolName,
              response: { result: message.content },
            },
          },
        ],
      });
    }
  }
  return contents;
}

function toGeminiTools(tools: AiToolDeclaration[]): Record<string, unknown>[] {
  if (tools.length === 0) return [];
  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
    },
  ];
}

export function createGeminiProvider(apiKey: string, model = GEMINI_DEFAULT_MODEL): AIProvider {
  return {
    id: "gemini",
    model,
    supportsTools: true,
    async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
      const body = {
        systemInstruction: { parts: [{ text: request.system }] },
        contents: toGeminiContents(request.messages),
        tools: toGeminiTools(request.tools),
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: request.maxOutputTokens ?? GEMINI_MAX_OUTPUT_TOKENS,
          thinkingConfig: { thinkingLevel: GEMINI_THINKING_LEVEL },
        },
      };

      let response: Response;
      try {
        response = await fetch(`${API_BASE}/${model}:generateContent`, {
          method: "POST",
          signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
          headers: {
            "Content-Type": "application/json",
            // Cheia merge în header, nu în URL: nu apare în loguri de request.
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(body),
        });
      } catch (error) {
        const name = (error as { name?: string } | null)?.name;
        if (name === "TimeoutError" || name === "AbortError") {
          throw new AiProviderError("Serviciul AI nu a răspuns în timp util.", 504, true);
        }
        throw new AiProviderError("Serviciul AI nu a putut fi contactat.", undefined, true);
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        // Detaliul rămâne în logurile serverului, fără cheie.
        console.error(`[ai] gemini ${response.status}: ${detail.slice(0, 400)}`);
        throw new AiProviderError(
          `Providerul AI a răspuns cu ${response.status}.`,
          response.status,
          response.status === 429 || response.status >= 500,
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new AiProviderError("Răspuns AI invalid.");
      }
      return parseGeminiResponse(payload);
    },
  };
}
