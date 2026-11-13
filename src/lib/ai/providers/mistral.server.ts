/**
 * MistralProvider — rezerva furnizorului principal Gemini.
 *
 * API compatibil OpenAI (chat completions, tool calling). Cheia vine doar din
 * `MISTRAL_API_KEY` pe server; nu ajunge în loguri, răspunsuri sau audit.
 */
import {
  AiProviderError,
  type AIProvider,
  type AiGenerateRequest,
  type AiGenerateResult,
  type AiProviderMessage,
} from "./types";

export const MISTRAL_DEFAULT_MODEL = "mistral-small-latest";
export const MISTRAL_MAX_OUTPUT_TOKENS = 2048;
const MISTRAL_TIMEOUT_MS = 60_000;
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

type MistralMessage = Record<string, unknown>;

/** Mistral cere identificatori de 9 caractere alfanumerice pentru apelurile de tool. */
function toolCallId(raw: string | undefined, index: number): string {
  const clean = (raw ?? "").replace(/[^a-zA-Z0-9]/g, "");
  if (clean.length === 9) return clean;
  if (clean.length > 9) return clean.slice(-9);
  return `c${String(index).padStart(8, "0")}`;
}

export function toMistralMessages(system: string, messages: AiProviderMessage[]): MistralMessage[] {
  const result: MistralMessage[] = [{ role: "system", content: system }];
  const pending = new Map<string, string[]>();
  let counter = 0;
  for (const message of messages) {
    if (message.role === "user") {
      const images = (message.attachments ?? []).filter((a) => a.mimeType.startsWith("image/"));
      if ((message.attachments?.length ?? 0) > images.length) {
        throw new AiProviderError("Rezerva AI nu acceptă acest tip de fișier.");
      }
      result.push({
        role: "user",
        content: images.length
          ? [
              { type: "text", text: message.content },
              ...images.map((a) => ({ type: "image_url", image_url: `data:${a.mimeType};base64,${a.base64}` })),
            ]
          : message.content,
      });
    } else if (message.role === "assistant") {
      result.push({ role: "assistant", content: message.content });
    } else if (message.role === "assistant_tool_call") {
      const id = toolCallId(message.callId, counter++);
      pending.set(message.toolName, [...(pending.get(message.toolName) ?? []), id]);
      const call = { id, type: "function", function: { name: message.toolName, arguments: JSON.stringify(message.arguments) } };
      const previous = result.at(-1);
      if (previous?.["role"] === "assistant" && Array.isArray(previous["tool_calls"])) {
        (previous["tool_calls"] as unknown[]).push(call);
      } else {
        result.push({ role: "assistant", content: "", tool_calls: [call] });
      }
    } else {
      const queue = pending.get(message.toolName) ?? [];
      const id = message.callId ? toolCallId(message.callId, 0) : queue.shift() ?? toolCallId(undefined, counter++);
      if (message.callId) {
        const at = queue.indexOf(id);
        if (at >= 0) queue.splice(at, 1);
      }
      result.push({ role: "tool", tool_call_id: id, name: message.toolName, content: message.content });
    }
  }
  return result;
}

/** Traduce răspunsul Mistral în formatul intern (text + apeluri de tool). */
export function parseMistralResponse(payload: unknown): AiGenerateResult {
  if (!payload || typeof payload !== "object") throw new AiProviderError("Răspuns AI invalid.");
  const response = payload as Record<string, unknown>;
  const choice = Array.isArray(response["choices"]) ? (response["choices"][0] as Record<string, unknown> | undefined) : undefined;
  const message = choice?.["message"] as Record<string, unknown> | undefined;
  if (!message) throw new AiProviderError("Răspuns AI invalid.");
  const content = message["content"];
  let text = "";
  if (typeof content === "string") text = content;
  else if (Array.isArray(content)) {
    text = content
      .map((part) => (part && typeof part === "object" && (part as Record<string, unknown>)["type"] === "text" ? String((part as Record<string, unknown>)["text"] ?? "") : ""))
      .join("");
  }
  const toolCalls: AiGenerateResult["toolCalls"] = [];
  for (const raw of Array.isArray(message["tool_calls"]) ? (message["tool_calls"] as unknown[]) : []) {
    const call = raw as Record<string, unknown> | null;
    const fn = call?.["function"] as Record<string, unknown> | undefined;
    if (!fn || typeof fn["name"] !== "string") throw new AiProviderError("Apel AI invalid.");
    let args: unknown = fn["arguments"];
    if (typeof args === "string") {
      try {
        args = args.trim() ? JSON.parse(args) : {};
      } catch {
        throw new AiProviderError("Apel AI invalid.");
      }
    }
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new AiProviderError("Apel AI invalid.");
    toolCalls.push({
      name: fn["name"],
      arguments: args as Record<string, unknown>,
      ...(typeof call?.["id"] === "string" ? { id: call["id"] as string } : {}),
    });
  }
  if (!text.trim() && toolCalls.length === 0) {
    if (choice?.["finish_reason"] === "length") {
      throw new AiProviderError("Răspunsul AI a depășit limita de lungime.");
    }
    throw new AiProviderError("Serviciul AI nu a putut genera un răspuns.");
  }
  const usage = response["usage"] as Record<string, unknown> | undefined;
  return {
    text,
    toolCalls,
    inputTokens: typeof usage?.["prompt_tokens"] === "number" ? usage["prompt_tokens"] : null,
    outputTokens: typeof usage?.["completion_tokens"] === "number" ? usage["completion_tokens"] : null,
  };
}

export function createMistralProvider(apiKey: string, model = MISTRAL_DEFAULT_MODEL): AIProvider {
  return {
    id: "mistral",
    model,
    supportsTools: true,
    async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
      const body = {
        model,
        messages: toMistralMessages(request.system, request.messages),
        temperature: 0.2,
        max_tokens: request.maxOutputTokens ?? MISTRAL_MAX_OUTPUT_TOKENS,
        ...(request.tools.length
          ? {
              tools: request.tools.map((tool) => ({
                type: "function",
                function: { name: tool.name, description: tool.description, parameters: tool.parameters },
              })),
              tool_choice: "auto",
            }
          : {}),
      };
      let response: Response;
      try {
        response = await fetch(MISTRAL_URL, {
          method: "POST",
          signal: AbortSignal.timeout(MISTRAL_TIMEOUT_MS),
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body),
        });
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        if (name === "TimeoutError" || name === "AbortError") {
          throw new AiProviderError("Serviciul AI nu a răspuns în timp util.", 504, true);
        }
        throw new AiProviderError("Serviciul AI nu a putut fi contactat.", undefined, true);
      }
      // Corpul erorii nu se citește: poate conține date din cerere.
      if (!response.ok) {
        console.error(`[ai] mistral ${response.status}`);
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
      return parseMistralResponse(payload);
    },
  };
}
