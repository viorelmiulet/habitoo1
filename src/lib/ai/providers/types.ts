/**
 * Abstracția de provider AI.
 *
 * Gateway-ul cunoaște doar `AIProvider`. Gemini este prima implementare;
 * OpenAI sau Anthropic se pot adăuga ulterior implementând aceeași interfață,
 * fără să atingem tool-urile, contextul sau componentele CRM.
 */

export type AiProviderMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | {
      role: "assistant_tool_call";
      toolName: string;
      arguments: Record<string, unknown>;
      /**
       * Semnătura de raționament emisă de provider pentru acest apel. Gemini 3
       * o cere înapoi la turul următor, altfel refuză cererea (400).
       */
      signature?: string | null;
    }
  | { role: "tool_result"; toolName: string; content: string };

export type AiToolDeclaration = {
  name: string;
  description: string;
  /** JSON Schema al parametrilor (obiect, proprietăți simple). */
  parameters: Record<string, unknown>;
};

export type AiGenerateRequest = {
  /** Instrucțiunile de sistem: reguli, niciodată date CRM. */
  system: string;
  messages: AiProviderMessage[];
  tools: AiToolDeclaration[];
  maxOutputTokens?: number;
};

export type AiGenerateResult = {
  text: string;
  toolCalls: {
    name: string;
    arguments: Record<string, unknown>;
    /** Semnătura de raționament a providerului, retrimisă la turul următor. */
    signature?: string | null;
  }[];
  inputTokens: number | null;
  outputTokens: number | null;
};

export type AIProvider = {
  /** Identificator scurt salvat în usage și audit. */
  readonly id: string;
  readonly model: string;
  readonly supportsTools: boolean;
  generate(request: AiGenerateRequest): Promise<AiGenerateResult>;
};

/** Eroare de provider. Detaliile tehnice rămân în logurile serverului. */
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

/** Traduce orice eroare de provider într-un mesaj sigur pentru interfață. */
export function safeAiProviderMessage(error: unknown): string {
  if (error instanceof AiProviderError) {
    if (error.status === 401 || error.status === 403) {
      return "AI nu este configurat corect. Contactează administratorul platformei.";
    }
    if (error.status === 429) {
      return "Serviciul AI este momentan aglomerat. Încearcă din nou în câteva minute.";
    }
    if (error.status === 504) return "Serviciul AI nu a răspuns în timp util. Încearcă din nou.";
    if (error.retryable) return "Serviciul AI este temporar indisponibil. Încearcă din nou.";
    return "Serviciul AI nu a putut genera un răspuns.";
  }
  return "Serviciul AI nu a putut genera un răspuns.";
}
