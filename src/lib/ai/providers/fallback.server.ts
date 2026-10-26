import { AiProviderError, type AIProvider } from "./types";

/** Retry remains at the model-call layer. Only restart the complete read/generation
 * callback here, before any persistent proposal or approved action is applied. */
export async function withAiProviderFallback<T>(
  primary: AIProvider,
  run: (provider: AIProvider) => Promise<T>,
): Promise<{ result: T; provider: AIProvider; fallbackUsed: boolean }> {
  try {
    return { result: await run(primary), provider: primary, fallbackUsed: primary.id === "gemini" };
  } catch (error) {
    if (!(error instanceof AiProviderError) || !error.retryable || !primary.fallback) throw error;
    const provider = primary.fallback;
    return { result: await run(provider), provider, fallbackUsed: true };
  }
}