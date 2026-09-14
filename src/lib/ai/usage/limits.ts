/**
 * Control de cost: limite de rată, dimensiune maximă a cererii și protecție
 * la bucle de tool calling. Toate sunt reguli pure, aplicate server-side.
 */

export const AI_RATE_LIMITS = {
  perUserMinute: { limit: 6, windowSeconds: 60 },
  perUserHour: { limit: 40, windowSeconds: 3600 },
  perOrganizationHour: { limit: 200, windowSeconds: 3600 },
} as const;

/** Lungimea maximă a mesajului utilizatorului. */
export const AI_MAX_MESSAGE_CHARS = 4000;
/** Numărul de mesaje din istoric trimise providerului. */
export const AI_HISTORY_MESSAGES = 10;
/** Numărul maxim de pași de tool calling într-o singură cerere (anti-buclă). */
export const AI_MAX_TOOL_STEPS = 4;
/** Numărul maxim de tool-uri executate într-o cerere. */
export const AI_MAX_TOOL_CALLS = 6;
/** Fereastra în care un mesaj identic este considerat dublu-click. */
export const AI_DUPLICATE_WINDOW_SECONDS = 15;

export type AiRequestValidation =
  | { ok: true; message: string }
  | { ok: false; message: string };

/** Validează dimensiunea și conținutul minim al cererii. */
export function validateAiRequestSize(raw: unknown): AiRequestValidation {
  if (typeof raw !== "string") {
    return { ok: false, message: "Mesajul trebuie să fie text." };
  }
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: false, message: "Scrie o întrebare pentru Habitoo AI." };
  }
  if (trimmed.length > AI_MAX_MESSAGE_CHARS) {
    return {
      ok: false,
      message: `Mesajul este prea lung (maximum ${AI_MAX_MESSAGE_CHARS} de caractere).`,
    };
  }
  return { ok: true, message: trimmed };
}

/** `true` dacă mesajul repetă ultima cerere în fereastra de dublu-click. */
export function isDuplicateAiRequest(
  last: { content: string; createdAt: string } | null,
  message: string,
  now: Date = new Date(),
): boolean {
  if (!last) return false;
  if (last.content.trim() !== message.trim()) return false;
  const at = Date.parse(last.createdAt);
  if (!Number.isFinite(at)) return false;
  const ageSeconds = (now.getTime() - at) / 1000;
  return ageSeconds >= 0 && ageSeconds <= AI_DUPLICATE_WINDOW_SECONDS;
}
