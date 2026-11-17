/**
 * Apelul AI pentru „Completează cu AI”. Pozele merg inline, doar în memorie.
 */
import type { AIProvider, AiProviderAttachment } from "@/lib/ai/providers/types";
import type { AutofillLocation, HistoryProposal } from "./history";
import {
  AUTOFILL_INVALID_MESSAGE,
  autofillCatalogForPrompt,
  sanitizeAutofillResponse,
  type AutofillProposal,
} from "./schema";

export type AutofillInput = {
  images: { mimeType: string; base64: string }[];
  text: string;
  /** Titlul, descrierea și valorile deja completate în formular. */
  context?: AutofillFormContext;
  history?: HistoryProposal;
  urban?: boolean;
};

export type AutofillFormContext = {
  title?: string;
  description?: string;
  /** Valorile deja completate (cheie → valoare), ca context. */
  known?: Record<string, string | number | boolean | string[] | null>;
  location?: AutofillLocation;
};

/** Textul din formular folosit și la validarea faptelor (sursa „text”). */
export function autofillContextText(ctx: AutofillFormContext | undefined): string {
  if (!ctx) return "";
  return [ctx.title?.trim() ?? "", ctx.description?.trim().slice(0, 6000) ?? ""].filter(Boolean).join("\n");
}

function knownForPrompt(known: AutofillFormContext["known"]): string {
  const rows = Object.entries(known ?? {}).filter(([k, v]) => k !== "__autofillChosen" && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0));
  return rows.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join("; ").slice(0, 2000);
}

export type AutofillResult = { ok: true; proposal: AutofillProposal } | { ok: false; message: string };

export const AUTOFILL_SYSTEM = `Ești asistentul Habitoo care completează formularul unei proprietăți imobiliare din România.
Primești poze și/sau un text scris de agent, plus titlul, descrierea și valorile deja completate în formular.
Răspunde DOAR cu un obiect JSON strict, fără alt text, cu forma:
{"fields": [{"key": string, "value": ..., "confidence": "high"|"medium"|"low", "source": "text"|"spoken"|"photos"}], "title": string|null, "description": string|null, "photo_order": number[]|null}
REGULI:
- Folosește doar cheile și valorile din lista de mai jos, scrise exact.
- Citește atent descrierea și titlul existente și extrage TOATE faptele explicite de acolo (etaj „3/8”, „P/4”, „parter”, suprafețe „65 mp utili”, an „bloc din 1985”, camere, băi, preț, tranzacție). Completează cât mai multe câmpuri permise.
- Sursa: "text" = din descrierea/titlul formularului; "spoken" = din textul scris de agent în asistent; "photos" = din poze.
- Prețul, adresa, localitatea, zona, etajul, anul și suprafețele se completează DOAR dacă apar explicit în text (source "spoken"/"text"). Nu le ghici niciodată din poze.
- La „P/4”: floor_label = "Parter", floor = 0, building_floors = 4. Numeralele scrise cu litere („etajul trei”) devin cifre. „Etaj intermediar” nu completează numărul.
- Completează rooms și bedrooms și din titlu/descriere, cu cifre sau numerale românești: „3 camere”, „trei camere”, „3 cam.”, „ap. 3 camere”, „1 cameră”; dormitoare: „două dormitoare”, „3 dorm.”. Garsonieră/studio → rooms=1, bedrooms=1. Apartament N camere (N≥2), fără dormitoare explicite → bedrooms=N−1. Dormitoarele explicite au prioritate; D dormitoare fără camere la apartament → rooms=D+1. La casă/vilă nu deduce dormitoarele din camere. Doar câmpuri goale; codul verifică și aplică deducțiile, nu ghici alte numere.
- Propune obligatoriu rooms și bedrooms când pot fi stabilite din text sau poze; la apartamente 2 camere → 1 dormitor, 3 → 2, 4 → 3. Camerele/dormitoarele din poze au source "photos", confidence "medium"; nu număra aceeași încăpere de mai multe ori. Textul explicit și alegerile agentului au prioritate. Nu inventa numere când nu pot fi stabilite.
- Din poze (source "photos", confidence "medium") deduci doar finisaje, dotări, mobilare, stare, priveliște, electrocasnice, open_kitchen, bathroom_window, balcony și numărul de camere/dormitoare/băi/bucătării, doar dacă pozele arată clar încăperi distincte.
- Nu repeta valorile deja completate în formular.
- Parcurge FIECARE câmp multi: utilities, heating_systems, cooling_systems, insulation, wall_finishes, floor_finishes, windows, blinds, shutters, entry_door, interior_doors, kitchen_features, metering, appliances, building_amenities, street_arrangement, views, misc_features, additional_spaces. Propune TOATE opțiunile susținute, nu doar prima. Inclusiv utilități, izolații, contorizare, imobil și diverse din poze când se văd clar contoare, interfon, lift, centrală; source photos și confidence medium. Nu confunda dotările nevăzute cu cele absente; respectă negațiile.
- Prioritate: alegerea agentului > text explicit > istoric al aceluiași imobil > poze > deducție. Istoricul este furnizat separat și se aplică în cod; nu îl retranscrie ca text explicit și nu copia din el etajul, suprafețele, prețul, camerele sau finisajele interioare.
- Dacă nu ești sigur, pune confidence "low" sau omite câmpul.
- Titlul și descrierea în română, doar cu fapte din câmpurile propuse și din ce a spus agentul; fără promisiuni, superlative, distanțe sau facilități de zonă nespuse.
- "photo_order": o permutare completă a tuturor indicilor pozelor (de la 0), fiecare exact o dată; null dacă nu poți recomanda o ordine.
- Coperta: cea mai reprezentativă și atractivă fotografie, de obicei livingul sau camera principală, luminoasă, clară, orizontală, fără oameni sau obiecte personale în prim-plan. La case/vile preferă fațada sau exteriorul dacă arată bine. Nu alege baie, hol, plan, document, captură de ecran, fotografie întunecată sau neclară.
- Restul în ordinea logică de vizitare: living → bucătărie → dormitoare → băi → balcon/terasă → exterior/clădire → planuri și documente. Fotografiile foarte slabe (neclare, întunecate, duplicate) merg la final; nu le elimina.
CÂMPURI PERMISE:
`;

export function buildAutofillRequest(input: AutofillInput) {
  const attachments: AiProviderAttachment[] = input.images.map((img) => ({ mimeType: img.mimeType, base64: img.base64, detail: "low" }));
  const parts = [
    `Poze atașate: ${input.images.length} (indici 0–${Math.max(0, input.images.length - 1)}).`,
    input.text.trim() ? `Textul agentului: """${input.text.trim().slice(0, 2000)}"""` : "Nu există text scris.",
  ];
  const ctxText = autofillContextText(input.context);
  if (ctxText) parts.push(`Titlul și descrierea din formular (source "text"): """${ctxText}"""`);
  const known = knownForPrompt(input.context?.known);
  if (known) parts.push(`Valori deja completate (nu le schimba): ${known}`);
  if (input.history && Object.keys(input.history.values).length) parts.push(`Din istoricul contului, același imobil: ${knownForPrompt(input.history.values).slice(0, 1500)}. Sursa istoric este aplicată de cod.`);
  return {
    system: AUTOFILL_SYSTEM + autofillCatalogForPrompt(),
    messages: [{ role: "user" as const, content: parts.join("\n"), attachments }],
    tools: [],
    maxOutputTokens: 8000,
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
    history: input.history,
    urban: input.urban,
  });
  if (!proposal) return { ok: false, message: AUTOFILL_INVALID_MESSAGE };
  return { ok: true, proposal, usage: { input: result.inputTokens, output: result.outputTokens } };
}
