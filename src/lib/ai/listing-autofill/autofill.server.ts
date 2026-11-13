/**
 * Apelul AI pentru „Anunț din poze și voce”. Pozele și audio-ul merg inline,
 * doar în memorie: nimic din audio nu se păstrează după procesare.
 */
import type { AIProvider, AiProviderAttachment } from "@/lib/ai/providers/types";
import {
  AUTOFILL_INVALID_MESSAGE,
  autofillCatalogForPrompt,
  sanitizeAutofillResponse,
  type AutofillProposal,
} from "./schema";

export type AutofillInput = {
  images: { mimeType: string; base64: string }[];
  audio: { mimeType: string; base64: string } | null;
  text: string;
};

export type AutofillResult = { ok: true; proposal: AutofillProposal } | { ok: false; message: string };

export const AUTOFILL_SYSTEM = `Ești asistentul Habitoo care completează formularul unei proprietăți imobiliare din România.
Primești poze, opțional o înregistrare vocală și/sau un text scris de agent.
Răspunde DOAR cu un obiect JSON strict, fără alt text, cu forma:
{"transcript": string|null, "fields": [{"key": string, "value": ..., "confidence": "high"|"medium"|"low", "source": "spoken"|"photos"}], "title": string|null, "description": string|null, "photo_order": number[]|null}
REGULI:
- Folosește doar cheile și valorile din lista de mai jos, scrise exact.
- "transcript": transcrierea fidelă a vocii, cu cifre (ex. „75000 euro”), sau null.
- Prețul, adresa, localitatea, zona, etajul, anul și suprafețele se completează DOAR dacă apar explicit în voce sau text (source "spoken"). Nu le ghici niciodată din poze.
- Din poze (source "photos") deduci doar finisaje, dotări, mobilare, stare și tipul încăperilor.
- Dacă nu ești sigur, pune confidence "low" sau omite câmpul.
- Titlul și descrierea în română, doar cu fapte din câmpurile propuse și din ce a spus agentul; fără promisiuni, superlative, distanțe sau facilități de zonă nespuse.
- "photo_order": indicii pozelor (de la 0) în ordinea recomandată; prima = coperta, cea mai reprezentativă.
CÂMPURI PERMISE:
`;

export function buildAutofillRequest(input: AutofillInput) {
  const attachments: AiProviderAttachment[] = input.images.map((img) => ({ mimeType: img.mimeType, base64: img.base64, detail: "low" }));
  if (input.audio) attachments.push({ mimeType: input.audio.mimeType, base64: input.audio.base64 });
  const parts = [
    `Poze atașate: ${input.images.length} (indici 0–${Math.max(0, input.images.length - 1)}).`,
    input.audio ? "Înregistrarea vocală a agentului este atașată după poze." : "Nu există înregistrare vocală.",
    input.text.trim() ? `Textul agentului: """${input.text.trim().slice(0, 2000)}"""` : "Nu există text scris.",
  ];
  return {
    system: AUTOFILL_SYSTEM + autofillCatalogForPrompt(),
    messages: [{ role: "user" as const, content: parts.join("\n"), attachments }],
    tools: [],
    maxOutputTokens: 4000,
  };
}

export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Rulează modelul și validează răspunsul. Un răspuns invalid nu aruncă: întoarce ok=false. */
export async function runListingAutofill(provider: AIProvider, input: AutofillInput): Promise<AutofillResult & { usage?: { input: number | null; output: number | null } }> {
  const result = await provider.generate(buildAutofillRequest(input));
  const proposal = sanitizeAutofillResponse(parseJsonLoose(result.text), {
    spokenText: input.text,
    photoCount: input.images.length,
  });
  if (!proposal) return { ok: false, message: AUTOFILL_INVALID_MESSAGE };
  return { ok: true, proposal, usage: { input: result.inputTokens, output: result.outputTokens } };
}
