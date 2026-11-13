import { AiProviderError } from "./types";
import { AI_MODEL_DEFAULTS, type AiModelSlot } from "./models";
import { createAiProviderForSlot } from "./registry.server";

/** Un apel scurt, fără date CRM. Răspunsul nu conține niciodată cheia. */
export async function runAiModelTest(slot: AiModelSlot, rawModel: string): Promise<{ ok: boolean; message: string }> {
  const model = rawModel.trim() || AI_MODEL_DEFAULTS[slot];
  const provider = createAiProviderForSlot(slot, model);
  if (!provider) {
    return { ok: false, message: slot === "fallback" ? "Cheia Mistral nu este configurată." : "Cheia Gemini nu este configurată." };
  }
  try {
    await provider.generate({
      system: "Răspunde scurt.",
      messages: [{ role: "user", content: "Răspunde doar cu OK." }],
      tools: [],
      maxOutputTokens: 32,
    });
    return { ok: true, message: `OK · ${model}` };
  } catch (error) {
    if (error instanceof AiProviderError) {
      const status = error.status;
      if (status === 404) return { ok: false, message: `Modelul „${model}” nu există sau nu este disponibil.` };
      if (status === 401 || status === 403) return { ok: false, message: "Cheia furnizorului a fost refuzată." };
      if (status === 400) return { ok: false, message: `Furnizorul a refuzat cererea pentru „${model}” (400).` };
      if (status === 429) return { ok: false, message: "Furnizorul limitează cererile (429). Încearcă mai târziu." };
      if (status) return { ok: false, message: `Furnizorul a răspuns cu ${status}.` };
      return { ok: false, message: error.message };
    }
    return { ok: false, message: "Testul nu a putut fi efectuat." };
  }
}
