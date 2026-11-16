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
  /** Titlul, descrierea și valorile deja completate în formular. */
  context?: AutofillFormContext;
};

export type AutofillFormContext = {
  title?: string;
  description?: string;
  /** Valorile deja completate (cheie → valoare), ca context. */
  known?: Record<string, string | number | boolean | string[] | null>;
};

/** Textul din formular folosit și la validarea faptelor (sursa „text”). */
export function autofillContextText(ctx: AutofillFormContext | undefined): string {
  if (!ctx) return "";
  return [ctx.title?.trim() ?? "", ctx.description?.trim().slice(0, 6000) ?? ""].filter(Boolean).join("\n");
}

function knownForPrompt(known: AutofillFormContext["known"]): string {
  const rows = Object.entries(known ?? {}).filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && v.length === 0));
  return rows.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join("; ").slice(0, 2000);
}

export type AutofillResult = { ok: true; proposal: AutofillProposal } | { ok: false; message: string };

export const AUTOFILL_SYSTEM = `Ești asistentul Habitoo care completează formularul unei proprietăți imobiliare din România.
Primești poze, opțional o înregistrare vocală și/sau un text scris de agent, plus titlul, descrierea și valorile deja completate în formular.
Răspunde DOAR cu un obiect JSON strict, fără alt text, cu forma:
{"transcript": string|null, "fields": [{"key": string, "value": ..., "confidence": "high"|"medium"|"low", "source": "text"|"spoken"|"photos"}], "title": string|null, "description": string|null, "photo_order": number[]|null}
REGULI:
- Folosește doar cheile și valorile din lista de mai jos, scrise exact.
- "transcript": transcrierea fidelă a vocii, cu cifre (ex. „75000 euro”), sau null.
- Citește atent descrierea și titlul existente și extrage TOATE faptele explicite de acolo (etaj „3/8”, „P/4”, „parter”, suprafețe „65 mp utili”, an „bloc din 1985”, camere, băi, preț, tranzacție). Completează cât mai multe câmpuri permise.
- Sursa: "text" = din descrierea/titlul formularului; "spoken" = din voce sau din textul scris de agent în asistent; "photos" = din poze.
- Prețul, adresa, localitatea, zona, etajul, anul și suprafețele se completează DOAR dacă apar explicit în voce sau text (source "spoken"/"text"). Nu le ghici niciodată din poze.
- La „P/4”: floor_label = "Parter", floor = 0, building_floors = 4. Numeralele scrise cu litere („etajul trei”) devin cifre. „Etaj intermediar” nu completează numărul.
- Din poze (source "photos", confidence "medium") deduci doar finisaje, dotări, mobilare, stare, priveliște, electrocasnice, open_kitchen, bathroom_window, balcony și numărul de băi/bucătării, doar dacă pozele arată clar încăperi distincte.
- Nu repeta valorile deja completate în formular.
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
  const ctxText = autofillContextText(input.context);
  if (ctxText) parts.push(`Titlul și descrierea din formular (source "text"): """${ctxText}"""`);
  const known = knownForPrompt(input.context?.known);
  if (known) parts.push(`Valori deja completate (nu le schimba): ${known}`);
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
    contextText: autofillContextText(input.context),
    current: input.context?.known ?? undefined,
    photoCount: input.images.length,
  });
  if (!proposal) return { ok: false, message: AUTOFILL_INVALID_MESSAGE };
  return { ok: true, proposal, usage: { input: result.inputTokens, output: result.outputTokens } };
}
