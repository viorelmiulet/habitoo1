import { AiProviderError, type AIProvider } from "./types";

/** Retry remains at the model-call layer. Only restart the complete read/generation
 * callback here, before any persistent proposal or approved action is applied.
 * The fallback (Mistral) runs for transient primary errors (timeout, 429, 5xx)
 * and for an unavailable primary model (404 / NOT_FOUND). */
export function shouldUseAiFallback(error: unknown): boolean {
  if (!(error instanceof AiProviderError)) return false;
  return error.retryable || error.status === 404 || /NOT_FOUND/.test(error.message);
}

export async function withAiProviderFallback<T>(
  primary: AIProvider,
  run: (provider: AIProvider) => Promise<T>,
): Promise<{ result: T; provider: AIProvider; fallbackUsed: boolean }> {
  try {
    return { result: await run(primary), provider: primary, fallbackUsed: false };
  } catch (error) {
    if (!shouldUseAiFallback(error) || !primary.fallback) throw error;
    const provider = primary.fallback;
    return { result: await run(provider), provider, fallbackUsed: true };
  }
}
