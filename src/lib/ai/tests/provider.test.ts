/**
 * Teste provider: răspuns valid, tool call, cheie lipsă, eșec, timeout,
 * răspuns malformat. Mesajele către utilizator rămân sigure.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseGeminiResponse } from "../providers/gemini.parse";
import { AiProviderError, safeAiProviderMessage } from "../providers/types";

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.restoreAllMocks();
});

describe("parseGeminiResponse", () => {
  it("citește textul și tokenurile", () => {
    const result = parseGeminiResponse({
      candidates: [{ content: { parts: [{ text: "Salut" }] } }],
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 5 },
    });
    expect(result.text).toBe("Salut");
    expect(result.toolCalls).toEqual([]);
    expect(result.inputTokens).toBe(12);
    expect(result.outputTokens).toBe(5);
  });

  it("citește apelurile de tool", () => {
    const result = parseGeminiResponse({
      candidates: [
        {
          content: {
            parts: [{ functionCall: { name: "search_properties", args: { query: "Pipera" } } }],
          },
        },
      ],
    });
    expect(result.toolCalls).toEqual([
      { name: "search_properties", arguments: { query: "Pipera" } },
    ]);
  });

  it("respinge răspunsul malformat", () => {
    expect(() => parseGeminiResponse({ candidates: [] })).toThrow(AiProviderError);
    expect(() => parseGeminiResponse(null)).toThrow(AiProviderError);
    expect(() => parseGeminiResponse({ candidates: [{ content: { parts: [] } }] })).toThrow(
      AiProviderError,
    );
  });

  it("respinge răspunsul blocat de filtrele providerului", () => {
    expect(() => parseGeminiResponse({ promptFeedback: { blockReason: "SAFETY" } })).toThrow(
      AiProviderError,
    );
  });
});

describe("configurarea providerului", () => {
  it("fără cheie nu există provider", async () => {
    delete process.env["GEMINI_API_KEY"];
    vi.resetModules();
    const registry = await import("../providers/registry.server");
    expect(registry.isAiConfigured()).toBe(false);
    expect(registry.resolveAiProvider()).toBeNull();
    expect(registry.aiProviderStatus().configured).toBe(false);
  });

  it("cu cheie există provider, iar cheia nu apare în stare", async () => {
    process.env["GEMINI_API_KEY"] = "test-key-123";
    vi.resetModules();
    const registry = await import("../providers/registry.server");
    expect(registry.isAiConfigured()).toBe(true);
    const provider = registry.resolveAiProvider();
    expect(provider?.id).toBe("gemini");
    expect(JSON.stringify(registry.aiProviderStatus())).not.toContain("test-key-123");
  });
});

describe("mesaje sigure de eroare", () => {
  it("nu expune detalii tehnice", () => {
    expect(safeAiProviderMessage(new AiProviderError("boom", 401))).not.toContain("boom");
    expect(safeAiProviderMessage(new AiProviderError("boom", 429))).toMatch(/încearcă|Încearcă/i);
    expect(safeAiProviderMessage(new Error("SQL error at line 12"))).not.toContain("SQL");
  });
});

describe("regresie: model și buget de tokeni (Gemini 3)", () => {
  it("modelul implicit nu este cel retras pentru cheile noi", async () => {
    const { GEMINI_DEFAULT_MODEL, GEMINI_MAX_OUTPUT_TOKENS, GEMINI_THINKING_LEVEL } = await import(
      "../providers/gemini.server"
    );
    expect(GEMINI_DEFAULT_MODEL).not.toBe("gemini-2.5-flash");
    expect(GEMINI_DEFAULT_MODEL).toMatch(/^gemini-/);
    // Bugetul acoperă și tokenii de raționament ai modelelor Gemini 3.
    expect(GEMINI_MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(2048);
    expect(GEMINI_THINKING_LEVEL).toBe("low");
  });

  it("MAX_TOKENS fără conținut dă un mesaj explicit, nu „răspuns invalid”", () => {
    let message = "";
    try {
      parseGeminiResponse({ candidates: [{ content: {}, finishReason: "MAX_TOKENS" }] });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/limita de lungime/i);
    expect(message).not.toMatch(/invalid/i);
  });
});
