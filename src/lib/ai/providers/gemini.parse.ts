/**
 * Parsarea răspunsului Gemini, separată de rețea ca să poată fi testată.
 * Un răspuns care nu respectă forma așteptată este o eroare explicită, nu un
 * răspuns gol prezentat utilizatorului ca rezultat valid.
 */
import { AiProviderError, type AiGenerateResult } from "./types";

type GeminiPart = {
  text?: unknown;
  functionCall?: { name?: unknown; args?: unknown };
  /** Semnătura de raționament: trebuie retrimisă la turul următor. */
  thoughtSignature?: unknown;
};

type GeminiPayload = {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: unknown }[];
  usageMetadata?: { promptTokenCount?: unknown; candidatesTokenCount?: unknown };
  promptFeedback?: { blockReason?: unknown };
};

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseGeminiResponse(payload: unknown): AiGenerateResult {
  if (payload === null || typeof payload !== "object") {
    throw new AiProviderError("Răspuns AI invalid.");
  }
  const data = payload as GeminiPayload;

  if (typeof data.promptFeedback?.blockReason === "string") {
    throw new AiProviderError("Cererea a fost blocată de filtrele de siguranță ale providerului.");
  }

  const candidate = Array.isArray(data.candidates) ? data.candidates[0] : undefined;
  const parts = candidate?.content?.parts;
  // Modelele cu raționament pot consuma tot bugetul de tokeni fără să emită
  // conținut: mesaj explicit, nu „răspuns invalid”.
  if (candidate?.finishReason === "MAX_TOKENS" && !Array.isArray(parts)) {
    throw new AiProviderError("Răspunsul AI a depășit limita de lungime. Reformulează cererea mai scurt.");
  }
  if (!candidate || !Array.isArray(parts)) {
    throw new AiProviderError("Răspuns AI invalid.");
  }

  let text = "";
  const toolCalls: AiGenerateResult["toolCalls"] = [];
  for (const part of parts) {
    if (typeof part?.text === "string") text += part.text;
    const call = part?.functionCall;
    if (call && typeof call.name === "string" && call.name !== "") {
      const args =
        call.args !== null && typeof call.args === "object" && !Array.isArray(call.args)
          ? (call.args as Record<string, unknown>)
          : {};
      toolCalls.push({
        name: call.name,
        arguments: args,
        signature: typeof part.thoughtSignature === "string" ? part.thoughtSignature : null,
      });
    }
  }

  if (text.trim() === "" && toolCalls.length === 0) {
    throw new AiProviderError("Răspuns AI invalid.");
  }

  return {
    text: text.trim(),
    toolCalls,
    inputTokens: num(data.usageMetadata?.promptTokenCount),
    outputTokens: num(data.usageMetadata?.candidatesTokenCount),
  };
}
