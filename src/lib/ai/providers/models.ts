/** Clasele de modele AI de text și valorile implicite. Fără secrete; sigur în browser. */
export type AiModelClass = "fast" | "standard";
export type AiModelSlot = AiModelClass | "fallback";
export type AiModelSettings = Record<AiModelSlot, string>;

export const AI_MODEL_DEFAULTS: AiModelSettings = {
  fast: "gemini-2.5-flash-lite",
  standard: "gemini-2.5-flash",
  fallback: "mistral-small-latest",
};

export const AI_MODEL_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/;

/** Câmp gol sau invalid → valoarea implicită. */
export function normalizeAiModelSettings(
  raw: Partial<Record<AiModelSlot, string | null | undefined>> | null | undefined,
): AiModelSettings {
  const pick = (slot: AiModelSlot) => {
    const value = raw?.[slot]?.trim();
    return value && AI_MODEL_NAME_PATTERN.test(value) ? value : AI_MODEL_DEFAULTS[slot];
  };
  return { fast: pick("fast"), standard: pick("standard"), fallback: pick("fallback") };
}
