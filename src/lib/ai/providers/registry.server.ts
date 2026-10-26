/**
 * Selecția providerului activ.
 *
 * Ordinea este explicită și extensibilă: adăugarea unui provider nou (OpenAI,
 * Anthropic) însemnă o intrare aici plus o implementare de `AIProvider`, fără
 * modificări în tool-uri, context sau UI.
 */
import type { AIProvider } from "./types";
import { createGeminiProvider, GEMINI_DEFAULT_MODEL } from "./gemini.server";
import { createMiniMaxProvider, MINIMAX_DEFAULT_MODEL, MINIMAX_DEFAULT_EFFORT } from "./minimax.server";

export type AiProviderId = "gemini" | "minimax";

export type AiProviderStatus = {
  configured: boolean;
  provider: AiProviderId;
  model: string;
  /** Providerii pregătiți arhitectural, dar neimplementați încă. */
  plannedProviders: string[];
  providers: { id: AiProviderId; model: string; configured: boolean }[];
};

function geminiModel(): string {
  const raw = process.env["GEMINI_MODEL"];
  return raw && raw.trim() !== "" ? raw.trim() : GEMINI_DEFAULT_MODEL;
}

/** Starea providerului, fără să expună vreodată cheia. */
export function aiProviderStatus(): AiProviderStatus {
  const key = process.env["GEMINI_API_KEY"];
  const miniMaxConfigured = Boolean(process.env["MINIMAX_API_KEY"]?.trim());
  const geminiConfigured = Boolean(key?.trim());
  const miniMaxModel = process.env["MINIMAX_MODEL"]?.trim() || MINIMAX_DEFAULT_MODEL;
  return {
    configured: miniMaxConfigured || geminiConfigured,
    provider: miniMaxConfigured || !geminiConfigured ? "minimax" : "gemini",
    model: miniMaxConfigured || !geminiConfigured ? miniMaxModel : geminiModel(),
    plannedProviders: ["openai", "anthropic"],
    providers: [
      { id: "minimax", model: miniMaxModel, configured: miniMaxConfigured },
      { id: "gemini", model: geminiModel(), configured: geminiConfigured },
    ],
  };
}

export function isAiConfigured(): boolean {
  return aiProviderStatus().configured;
}

/** Providerul activ sau `null` când secretul nu este configurat. */
export function resolveAiProvider(): AIProvider | null {
  const key = process.env["GEMINI_API_KEY"];
  const fallback = key?.trim() ? createGeminiProvider(key.trim(), geminiModel()) : undefined;
  const miniMaxKey = process.env["MINIMAX_API_KEY"]?.trim();
  if (!miniMaxKey) return fallback ?? null;
  return { ...createMiniMaxProvider(miniMaxKey, process.env["MINIMAX_MODEL"]?.trim() || MINIMAX_DEFAULT_MODEL,
    process.env["MINIMAX_EFFORT"]?.trim() || MINIMAX_DEFAULT_EFFORT), fallback };
}
