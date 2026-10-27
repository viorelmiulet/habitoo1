/** „Verificare AI” — apelul AI (MiniMax prin registry, Gemini rezervă). Doar server. */
import { resolveAiProvider } from "@/lib/ai/providers/registry.server";
import { withAiProviderFallback } from "@/lib/ai/providers/fallback.server";
import { withRetry } from "@/lib/ai/reliability/retry";
import { AiProviderError } from "@/lib/ai/providers/types";
import { enrichCostUsd } from "../enrichment";
import type { AcpSubject } from "../scoring";
import {
  ACP_AI_REVIEW_PROMPT_VERSION,
  ACP_AI_REVIEW_SYSTEM_PROMPT,
  buildReviewPayload,
  buildReviewUserPrompt,
  parseReviewResponse,
  type AcpReviewComparableInput,
  type AcpReviewVerdict,
} from "./review";

export type AcpReviewCallResult = {
  ok: boolean;
  items: Record<string, AcpReviewVerdict>;
  provider: string;
  model: string;
  fallbackUsed: boolean;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
  promptVersion: string;
  payload: unknown;
};

export async function callAcpComparableReview(
  target: AcpSubject,
  comparables: readonly AcpReviewComparableInput[],
  targetTitle?: string | null,
): Promise<AcpReviewCallResult> {
  const primary = resolveAiProvider();
  if (!primary) throw new AiProviderError("AI neconfigurat", 401);
  const { refs, payload } = buildReviewPayload(target, comparables, targetTitle);
  const user = buildReviewUserPrompt(payload);
  const started = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  const completed = await withAiProviderFallback(primary, async (provider) => {
    inputTokens = 0;
    outputTokens = 0;
    let parsed = parseReviewResponse("", refs);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const answer = await withRetry(() =>
        provider.generate({
          system: ACP_AI_REVIEW_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content:
                attempt === 0
                  ? user
                  : `${user}\nRăspunsul anterior nu a fost JSON valid sau nu a acoperit toate ref-urile. Întoarce acum exclusiv obiectul JSON.`,
            },
          ],
          tools: [],
        }),
      );
      inputTokens += answer.inputTokens ?? 0;
      outputTokens += answer.outputTokens ?? 0;
      parsed = parseReviewResponse(answer.text, refs);
      if (parsed.ok) break;
    }
    return parsed;
  });
  return {
    ok: completed.result.ok,
    items: completed.result.items,
    provider: completed.provider.id,
    model: completed.provider.model,
    fallbackUsed: completed.fallbackUsed,
    inputTokens,
    outputTokens,
    latencyMs: Date.now() - started,
    costUsd: enrichCostUsd(completed.provider.id, inputTokens, outputTokens),
    promptVersion: ACP_AI_REVIEW_PROMPT_VERSION,
    payload,
  };
}
