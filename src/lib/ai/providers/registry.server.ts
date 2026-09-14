/**
 * Selecția providerului activ.
 *
 * Ordinea este explicită și extensibilă: adăugarea unui provider nou (OpenAI,
 * Anthropic) însemnă o intrare aici plus o implementare de `AIProvider`, fără
 * modificări în tool-uri, context sau UI.
 */
import type { AIProvider } from "./types";
import { createGeminiProvider, GEMINI_DEFAULT_MODEL } from "./gemini.server";

export type AiProviderId = "gemini";

export type AiProviderStatus = {
  configured: boolean;
  provider: AiProviderId;
  model: string;
  /** Providerii pregătiți arhitectural, dar neimplementați încă. */
  plannedProviders: string[];
};

function geminiModel(): string {
  const raw = process.env["GEMINI_MODEL"];
  return raw && raw.trim() !== "" ? raw.trim() : GEMINI_DEFAULT_MODEL;
}

/** Starea providerului, fără să expună vreodată cheia. */
export function aiProviderStatus(): AiProviderStatus {
  const key = process.env["GEMINI_API_KEY"];
  return {
    configured: Boolean(key && key.trim() !== ""),
    provider: "gemini",
    model: geminiModel(),
    plannedProviders: ["openai", "anthropic"],
  };
}

export function isAiConfigured(): boolean {
  return aiProviderStatus().configured;
}

/** Providerul activ sau `null` când secretul nu este configurat. */
export function resolveAiProvider(): AIProvider | null {
  const key = process.env["GEMINI_API_KEY"];
  if (!key || key.trim() === "") return null;
  return createGeminiProvider(key.trim(), geminiModel());
}
