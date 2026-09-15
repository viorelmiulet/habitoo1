/**
 * Marketing Agent — generarea conținutului (Stage 16).
 *
 * Frontend → server function autentificat → tool-uri server-side (context) →
 * provider (Gemini azi, alt provider mâine) → verificare factuală deterministă.
 *
 * Modelul nu primește obiectul brut din baza de date și nu are tool-uri
 * executabile: primește o fișă de fapte construită pe listă albă și întoarce
 * text. Textul devine „utilizabil” doar dacă trece verificarea factuală.
 */
import type { AIProvider } from "../../providers/types";
import { safeAiProviderMessage } from "../../providers/types";
import { withRetry } from "../../reliability/retry";
import type { AiTracer } from "../../tracing/trace";
import {
  buildMarketingSystemPrompt,
  buildMarketingUserPrompt,
  HABITOO_MARKETING_AGENT,
  type MarketingPromptInput,
} from "./instructions";
import { marketingChannelSpec } from "./channels";
import { marketingContentText, parseMarketingContent, type MarketingContent } from "./content";
import {
  mergeMarketingValidation,
  validateMarketingFacts,
  validateMarketingLimits,
  type MarketingValidation,
} from "./facts";

export { HABITOO_MARKETING_AGENT };

export type MarketingGenerationOutput = {
  content: MarketingContent;
  validation: MarketingValidation;
  inputTokens: number | null;
  outputTokens: number | null;
  /** Numărul de încercări: a doua apare doar după o respingere factuală. */
  attempts: number;
};

export type MarketingGenerationResult =
  | { ok: true; result: MarketingGenerationOutput }
  | { ok: false; message: string };

function validate(content: MarketingContent, input: MarketingPromptInput): MarketingValidation {
  const spec = marketingChannelSpec(input.channel);
  const base = validateMarketingFacts(marketingContentText(content), input.facts);
  return mergeMarketingValidation(
    base,
    validateMarketingLimits({ title: content.title, body: content.body }, spec),
  );
}

/**
 * O generare, cu o singură regenerare corectivă dacă verificarea factuală
 * respinge rezultatul. Nu „reparăm” textul noi: cerem modelului să elimine
 * afirmațiile inventate.
 */
export async function generateMarketingContent(
  input: MarketingPromptInput & { provider: AIProvider; tracer: AiTracer },
): Promise<MarketingGenerationResult> {
  const system = buildMarketingSystemPrompt();
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let last: { content: MarketingContent; validation: MarketingValidation } | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const promptInput: MarketingPromptInput = {
      ...input,
      issues: attempt === 1 ? undefined : (last?.validation.issues ?? []),
    };
    try {
      const result = await withRetry(() =>
        input.provider.generate({
          system,
          messages: [{ role: "user", content: buildMarketingUserPrompt(promptInput) }],
        }),
      );
      inputTokens = result.inputTokens ?? inputTokens;
      outputTokens = result.outputTokens ?? outputTokens;
      input.tracer.record("model", `${input.provider.id}.marketing`, {
        details: { attempt, propertyId: input.facts.propertyId },
      });

      const parsed = parseMarketingContent(result.text);
      if (!parsed.ok) {
        if (attempt === 2) return { ok: false, message: parsed.message };
        continue;
      }
      const validation = validate(parsed.content, input);
      last = { content: parsed.content, validation };
      if (validation.status !== "invalid") {
        return {
          ok: true,
          result: { ...last, inputTokens, outputTokens, attempts: attempt },
        };
      }
      input.tracer.record("step", "validate_facts", {
        status: "failed",
        details: { attempt, issues: validation.issues.length },
      });
    } catch (error) {
      input.tracer.record("error", `${HABITOO_MARKETING_AGENT}.generate`, { status: "failed" });
      return { ok: false, message: safeAiProviderMessage(error) };
    }
  }

  if (last) {
    // Rezultat păstrat, dar marcat invalid: utilizatorul vede problemele și nu
    // îl poate salva sau aplica.
    return { ok: true, result: { ...last, inputTokens, outputTokens, attempts: 2 } };
  }
  return { ok: false, message: "Conținutul nu a putut fi generat. Încearcă din nou." };
}
