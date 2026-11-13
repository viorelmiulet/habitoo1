/** Gemini principal, Mistral rezervă; modele din SuperAdmin. Fără apeluri reale. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  aiProviderStatus,
  resolveAiProvider,
  setAiModelSettingsLoader,
} from "../providers/registry.server";
import { withAiProviderFallback } from "../providers/fallback.server";
import { parseMistralResponse, toMistralMessages } from "../providers/mistral.server";
import { AiProviderError } from "../providers/types";

const geminiOk = (text: string) =>
  Response.json({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2 } });
const mistralOk = (text: string) =>
  Response.json({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 4, completion_tokens: 1 } });

const request = { system: "s", messages: [{ role: "user" as const, content: "salut" }], tools: [] };

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "g-fixture");
  vi.stubEnv("MISTRAL_API_KEY", "m-fixture");
  vi.stubEnv("MINIMAX_API_KEY", "");
  setAiModelSettingsLoader(async () => null);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  setAiModelSettingsLoader(null);
});

describe("furnizori de text", () => {
  it("fără MISTRAL_API_KEY → doar Gemini, fără rezervă", async () => {
    vi.stubEnv("MISTRAL_API_KEY", "");
    const provider = resolveAiProvider();
    expect(provider?.id).toBe("gemini");
    expect(provider?.fallback).toBeUndefined();
    const status = await aiProviderStatus();
    expect(status.providers.find((p) => p.id === "mistral")?.configured).toBe(false);
  });

  it("Gemini 503 → răspunsul vine de la Mistral", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("generativelanguage") ? new Response("x", { status: 503 }) : mistralOk("din rezervă"),
    );
    vi.stubGlobal("fetch", fetchMock);
    const primary = resolveAiProvider("standard")!;
    const out = await withAiProviderFallback(primary, (p) => p.generate(request));
    expect(out.fallbackUsed).toBe(true);
    expect(out.provider.id).toBe("mistral");
    expect(out.provider.model).toBe("mistral-small-latest");
    expect(out.result.text).toBe("din rezervă");
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("https://api.mistral.ai/v1/chat/completions");
  });

  it("Gemini 400 → fără rezervă, eroare", async () => {
    const fetchMock = vi.fn(async () => new Response("bad", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const primary = resolveAiProvider()!;
    await expect(withAiProviderFallback(primary, (p) => p.generate(request))).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clasa „rapid” folosește modelul salvat; câmpul gol revine la implicit", async () => {
    const fetchMock = vi.fn(async (_url: string) => geminiOk("ok"));
    vi.stubGlobal("fetch", fetchMock);
    setAiModelSettingsLoader(async () => ({ fast: "gemini-fast-saved", standard: "  ", fallback: null }));
    const fast = resolveAiProvider("fast")!;
    await fast.generate(request);
    expect(fast.model).toBe("gemini-fast-saved");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/gemini-fast-saved:generateContent");
    const standard = resolveAiProvider("standard")!;
    await standard.generate(request);
    expect(standard.model).toBe("gemini-2.5-flash");
    expect(standard.fallback?.model).toBe("mistral-small-latest");
  });

  it("MINIMAX_API_KEY setat nu mai schimbă furnizorul de text", async () => {
    vi.stubEnv("MINIMAX_API_KEY", "mm-fixture");
    const fetchMock = vi.fn(async (_url: string) => geminiOk("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const provider = resolveAiProvider()!;
    expect(provider.id).toBe("gemini");
    await provider.generate(request);
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("minimax");
    const status = await aiProviderStatus();
    expect(status.providers.map((p) => p.id)).toEqual(["gemini", "mistral"]);
    expect(JSON.stringify(status)).not.toMatch(/minimax|fixture/i);
  });
});

describe("maparea Mistral", () => {
  it("text + tool calls în formatul intern", () => {
    const result = parseMistralResponse({
      choices: [
        {
          message: {
            content: "Caut",
            tool_calls: [{ id: "abc123XYZ", type: "function", function: { name: "search_properties", arguments: '{"query":"Cluj"}' } }],
          },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
    expect(result).toEqual({
      text: "Caut",
      toolCalls: [{ id: "abc123XYZ", name: "search_properties", arguments: { query: "Cluj" } }],
      inputTokens: 10,
      outputTokens: 5,
    });
  });

  it("argumente invalide → eroare; mesajele de tool au id-uri pereche", () => {
    expect(() =>
      parseMistralResponse({ choices: [{ message: { content: "", tool_calls: [{ function: { name: "x", arguments: "{" } }] } }] }),
    ).toThrow(AiProviderError);
    const messages = toMistralMessages("sys", [
      { role: "user", content: "q" },
      { role: "assistant_tool_call", toolName: "search", arguments: { a: 1 } },
      { role: "tool_result", toolName: "search", content: "{}" },
    ]);
    const call = (messages[2]?.["tool_calls"] as { id: string; function: { arguments: string } }[])[0]!;
    expect(call.id).toMatch(/^[a-zA-Z0-9]{9}$/);
    expect(call.function.arguments).toBe('{"a":1}');
    expect(messages[3]).toMatchObject({ role: "tool", tool_call_id: call.id, name: "search" });
    expect(messages[0]).toEqual({ role: "system", content: "sys" });
  });
});
