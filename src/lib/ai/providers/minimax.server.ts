import {
  AiProviderError,
  type AIProvider,
  type AiGenerateRequest,
  type AiGenerateResult,
  type AiProviderMessage,
} from "./types";

export const MINIMAX_DEFAULT_MODEL = "MiniMax-M3.1-Flash";
export const MINIMAX_DEFAULT_EFFORT = "low";
export const MINIMAX_MAX_TOKENS = 8192;
const MINIMAX_TIMEOUT_MS = 60_000;

type Content = Record<string, unknown>[];
type Message = { role: "user" | "assistant"; content: Content };

export function toMiniMaxMessages(messages: AiProviderMessage[]): Message[] {
  const result: Message[] = [];
  for (const message of messages) {
    let role: Message["role"];
    let content: Content;
    if (message.role === "user") {
      role = "user";
      content = [{ type: "text", text: message.content }];
      for (const image of message.attachments ?? []) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: image.mimeType, data: image.base64 },
          ...(image.detail ? { detail: image.detail } : {}),
        });
      }
    } else if (message.role === "assistant") {
      role = "assistant";
      content = message.rawContent ?? [{ type: "text", text: message.content }];
    } else if (message.role === "assistant_tool_call") {
      if (!message.callId) throw new AiProviderError("Identificatorul apelului AI lipsește.");
      role = "assistant";
      content = [
        { type: "tool_use", id: message.callId, name: message.toolName, input: message.arguments },
      ];
    } else {
      if (!message.callId) throw new AiProviderError("Identificatorul rezultatului AI lipsește.");
      role = "user";
      content = [{ type: "tool_result", tool_use_id: message.callId, content: message.content }];
    }
    const previous = result.at(-1);
    if (previous?.role === role) previous.content.push(...content);
    else result.push({ role, content: [...content] });
  }
  return result;
}

export function parseMiniMaxResponse(payload: unknown): AiGenerateResult {
  if (!payload || typeof payload !== "object") throw new AiProviderError("Răspuns AI invalid.");
  const response = payload as Record<string, unknown>;
  if (response["type"] === "error" || response["stop_reason"] === "refusal") {
    throw new AiProviderError("Serviciul AI nu a putut genera un răspuns.");
  }
  if (!Array.isArray(response["content"])) throw new AiProviderError("Răspuns AI invalid.");
  const content = response["content"] as Content;
  const toolCalls: AiGenerateResult["toolCalls"] = [];
  const texts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") throw new AiProviderError("Răspuns AI invalid.");
    if (block["type"] === "text" && typeof block["text"] === "string") texts.push(block["text"]);
    if (block["type"] === "tool_use") {
      if (
        typeof block["id"] !== "string" ||
        typeof block["name"] !== "string" ||
        !block["input"] ||
        typeof block["input"] !== "object" ||
        Array.isArray(block["input"])
      ) {
        throw new AiProviderError("Apel AI invalid.");
      }
      toolCalls.push({
        id: block["id"],
        name: block["name"],
        arguments: block["input"] as Record<string, unknown>,
      });
    }
  }
  if (!texts.join("").trim() && !toolCalls.length)
    throw new AiProviderError("Serviciul AI nu a putut genera un răspuns.");
  const usage = response["usage"] as Record<string, unknown> | undefined;
  return {
    text: texts.join("\n"),
    toolCalls,
    rawAssistantContent: content,
    inputTokens: typeof usage?.["input_tokens"] === "number" ? usage["input_tokens"] : null,
    outputTokens: typeof usage?.["output_tokens"] === "number" ? usage["output_tokens"] : null,
  };
}

export function createMiniMaxProvider(
  apiKey: string,
  model = MINIMAX_DEFAULT_MODEL,
  effort = MINIMAX_DEFAULT_EFFORT,
): AIProvider {
  return {
    id: "minimax",
    model,
    supportsTools: true,
    async generate(request: AiGenerateRequest) {
      let response: Response;
      try {
        response = await fetch("https://api.minimax.io/anthropic/v1/messages", {
          method: "POST",
          signal: AbortSignal.timeout(MINIMAX_TIMEOUT_MS),
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            system: request.system,
            messages: toMiniMaxMessages(request.messages),
            max_tokens: MINIMAX_MAX_TOKENS,
            output_config: { effort },
            ...(request.tools.length
              ? {
                  tools: request.tools.map((tool) => ({
                    name: tool.name,
                    description: tool.description,
                    input_schema: tool.parameters,
                  })),
                  tool_choice: { type: "auto" },
                }
              : {}),
          }),
        });
      } catch (error) {
        if (error instanceof AiProviderError) throw error;
        const name = error instanceof Error ? error.name : "";
        throw new AiProviderError(
          "Serviciul AI nu a putut fi contactat.",
          name === "TimeoutError" || name === "AbortError" ? 504 : undefined,
          true,
        );
      }
      // Never read/log an upstream error body: it can contain sensitive request data.
      if (!response.ok)
        throw new AiProviderError(
          "Serviciul AI nu a putut genera un răspuns.",
          response.status,
          [429, 500, 529].includes(response.status),
        );
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new AiProviderError("Răspuns AI invalid.");
      }
      return parseMiniMaxResponse(payload);
    },
  };
}
