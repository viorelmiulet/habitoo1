/** Modelele media AI (imagini, video, voce) și valorile implicite. Fără secrete; sigur în browser. */
export type AiMediaModelSlot = "image" | "video" | "voice";
export type AiMediaModelSettings = Record<AiMediaModelSlot, string>;

export const AI_MEDIA_MODEL_DEFAULTS: AiMediaModelSettings = {
  image: "gemini-2.5-flash-image",
  video: "fal-ai/kling-video/v2.5-turbo/standard/image-to-video",
  voice: "gemini-2.5-flash-preview-tts",
};

/** ID-urile fal conțin „/”; cele Gemini nu. */
export const AI_MEDIA_MODEL_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,149}$/;

export function normalizeAiMediaModelSettings(
  raw: Partial<Record<AiMediaModelSlot, string | null | undefined>> | null | undefined,
): AiMediaModelSettings {
  const pick = (slot: AiMediaModelSlot) => {
    const value = raw?.[slot]?.trim();
    return value && AI_MEDIA_MODEL_NAME_PATTERN.test(value) && !value.includes("..") ? value : AI_MEDIA_MODEL_DEFAULTS[slot];
  };
  return { image: pick("image"), video: pick("video"), voice: pick("voice") };
}
