/** Test de accesibilitate pentru modelele media: doar citirea metadatelor, fără generare plătită. */
import { AI_MEDIA_MODEL_DEFAULTS, AI_MEDIA_MODEL_NAME_PATTERN, type AiMediaModelSlot } from "./models";

export async function runAiMediaModelTest(slot: AiMediaModelSlot, rawModel: string): Promise<{ ok: boolean; message: string }> {
  const model = rawModel.trim() || AI_MEDIA_MODEL_DEFAULTS[slot];
  if (!AI_MEDIA_MODEL_NAME_PATTERN.test(model) || model.includes("..")) return { ok: false, message: "Numele modelului nu este valid." };
  const fal = slot === "video";
  const key = process.env[fal ? "FAL_KEY" : "GEMINI_API_KEY"]?.trim();
  if (!key) return { ok: false, message: fal ? "Cheia fal nu este configurată." : "Cheia Gemini nu este configurată." };
  const url = fal
    ? `https://api.fal.ai/v1/models?endpoint_id=${encodeURIComponent(model)}`
    : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`;
  let response: Response;
  try {
    response = await fetch(url, { headers: fal ? { Authorization: `Key ${key}` } : { "x-goog-api-key": key }, signal: AbortSignal.timeout(15_000) });
  } catch { return { ok: false, message: "Furnizorul nu a putut fi contactat." }; }
  if (response.status === 404) return { ok: false, message: `Modelul „${model}” nu există sau nu este disponibil.` };
  if (response.status === 401 || response.status === 403) return { ok: false, message: "Cheia furnizorului a fost refuzată." };
  if (!response.ok) return { ok: false, message: `Furnizorul a răspuns cu ${response.status}.` };
  if (fal) {
    const body = await response.json().catch(() => null) as { models?: { endpoint_id?: string }[] } | null;
    if (!body?.models?.some((m) => m.endpoint_id === model)) return { ok: false, message: `Modelul „${model}” nu există sau nu este disponibil.` };
  }
  return { ok: true, message: `OK · ${model}` };
}
