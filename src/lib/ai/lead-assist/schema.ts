/**
 * Asistentul de lead-uri (browser-safe): schema răspunsului AI, filtrarea la
 * valorile spuse explicit de client, diferențele față de o cerere existentă și
 * verificarea ciornei (fără cifre inventate). Nu scrie nimic în baza de date.
 */
import { z } from "zod";

export const LEAD_INTENTS = ["viewing", "question", "negotiation", "other"] as const;
export type LeadIntent = (typeof LEAD_INTENTS)[number];
export const LEAD_INTENT_LABELS: Record<LeadIntent, string> = {
  viewing: "vrea vizionare",
  question: "are o întrebare",
  negotiation: "vrea să negocieze",
  other: "altceva",
};

const num = z.number().finite().nonnegative().nullable().optional();
const bool = z.boolean().nullable().optional();
export const leadAiResponseSchema = z.object({
  request: z.object({
    kind: z.enum(["buy", "rent"]).nullable().optional(),
    budget_min: num,
    budget_max: num,
    currency: z.enum(["EUR", "RON", "USD"]).nullable().optional(),
    cities: z.array(z.string().max(80)).max(10).nullable().optional(),
    areas: z.array(z.string().max(80)).max(20).nullable().optional(),
    rooms_min: num,
    rooms_max: num,
    surface_min: num,
    property_type: z.string().max(40).nullable().optional(),
    wants_parking: bool,
    wants_balcony: bool,
    furnished: bool,
    pets_allowed: bool,
    term: z.string().max(120).nullable().optional(),
  }),
  intent: z.enum(LEAD_INTENTS),
  language: z.string().max(10).nullable().optional(),
  draft: z.string().max(1500).nullable().optional(),
});
export type LeadAiResponse = z.infer<typeof leadAiResponseSchema>;

export type ExtractedRequest = {
  kind: "buy" | "rent" | null;
  budget_min: number | null;
  budget_max: number | null;
  currency: string | null;
  cities: string[];
  areas: string[];
  rooms_min: number | null;
  rooms_max: number | null;
  surface_min: number | null;
  property_type: string | null;
  wants_parking: boolean | null;
  wants_balcony: boolean | null;
  furnished: boolean | null;
  pets_allowed: boolean | null;
  term: string | null;
};

export const PROPERTY_TYPES = ["apartment", "studio", "house", "land", "commercial", "office"] as const;

export function fold(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Toate numerele din text, cu multiplicatori „k”/„mii”/„mil”. */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  const re = /(\d+(?:[.,\s]\d{3})*(?:[.,]\d+)?)\s*(k\b|mii\b|mil\b|milioane\b)?/gi;
  for (const m of fold(text).matchAll(re)) {
    let raw = m[1]!.replace(/\s/g, "");
    if (/[.,]\d{3}(?!\d)/.test(raw)) raw = raw.replace(/[.,](?=\d{3}(?!\d))/g, "");
    const n = Number(raw.replace(",", "."));
    if (!Number.isFinite(n)) continue;
    const mult = m[2]?.toLowerCase();
    out.push(n);
    if (mult === "k" || mult === "mii") out.push(n * 1000);
    if (mult === "mil" || mult === "milioane") out.push(n * 1_000_000);
  }
  return out;
}

const ROOM_WORDS: Record<string, number> = { o: 1, una: 1, un: 1, doua: 2, doi: 2, trei: 3, patru: 4, cinci: 5, sase: 6 };
function roomsIn(text: string): number[] {
  const t = fold(text);
  const out = new Set<number>();
  for (const m of t.matchAll(/(\d+|o|una|un|doua|doi|trei|patru|cinci|sase)\s*(?:-\s*)?(camere|camera|cam\b)/g)) {
    out.add(ROOM_WORDS[m[1]!] ?? Number(m[1]));
  }
  if (/garsonier/.test(t)) out.add(1);
  return [...out];
}

const mentioned = (n: number | null | undefined, list: number[]) =>
  typeof n === "number" && list.some((v) => Math.abs(v - n) < 0.5) ? n : null;

function words(text: string, values: string[] | null | undefined): string[] {
  const t = fold(text);
  return [...new Set((values ?? []).map((v) => v.trim()).filter((v) => v.length > 1 && t.includes(fold(v))))];
}

/** Păstrează doar valorile spuse explicit în mesajul clientului. */
export function sanitizeExtraction(raw: LeadAiResponse["request"], message: string): ExtractedRequest {
  const nums = numbersIn(message);
  const rooms = roomsIn(message);
  const t = fold(message);
  const hasCurrency = /€|eur|euro|lei|ron|\$|usd|dolari/.test(t);
  const budgetMin = mentioned(raw.budget_min, nums);
  const budgetMax = mentioned(raw.budget_max, nums);
  const kindOk = raw.kind === "rent" ? /inchiri|chirie|rent/.test(t) : raw.kind === "buy" ? /cumpar|achizit|vand|buy|caut|vreau/.test(t) : false;
  return {
    kind: kindOk ? raw.kind! : null,
    budget_min: budgetMin,
    budget_max: budgetMax,
    currency: (budgetMin != null || budgetMax != null) && hasCurrency ? (raw.currency ?? null) : null,
    cities: words(message, raw.cities),
    areas: words(message, raw.areas),
    rooms_min: mentioned(raw.rooms_min, rooms),
    rooms_max: mentioned(raw.rooms_max, rooms),
    surface_min: /mp|m2|metri|m²/.test(t) ? mentioned(raw.surface_min, nums) : null,
    property_type: raw.property_type && (PROPERTY_TYPES as readonly string[]).includes(raw.property_type) ? raw.property_type : null,
    wants_parking: raw.wants_parking && /parcar|garaj|loc de parcare/.test(t) ? true : null,
    wants_balcony: raw.wants_balcony && /balcon|terasa/.test(t) ? true : null,
    furnished: typeof raw.furnished === "boolean" && /mobil/.test(t) ? raw.furnished : null,
    pets_allowed: raw.pets_allowed && /animal|caine|pisica|catel/.test(t) ? true : null,
    term: raw.term && raw.term.trim() ? raw.term.trim() : null,
  };
}

export function hasExtraction(e: ExtractedRequest): boolean {
  return Object.entries(e).some(([, v]) => (Array.isArray(v) ? v.length > 0 : v !== null));
}

export type RequestLike = Partial<Record<keyof ExtractedRequest, unknown>>;
export type ProposedChange = { field: keyof ExtractedRequest; value: unknown; text: string };

const money = (n: number, c: string | null) => `${n.toLocaleString("ro-RO")} ${c === "EUR" || !c ? "€" : c}`;

function describe(field: keyof ExtractedRequest, value: unknown, currency: string | null): string {
  switch (field) {
    case "budget_min": return `buget min ${money(value as number, currency)}`;
    case "budget_max": return `buget max ${money(value as number, currency)}`;
    case "rooms_min": return `minimum ${value} camere`;
    case "rooms_max": return `maximum ${value} camere`;
    case "surface_min": return `suprafață minimă ${value} mp`;
    case "cities": return `localitatea ${(value as string[]).join(", ")}`;
    case "areas": return `zona ${(value as string[]).join(", ")}`;
    case "kind": return value === "rent" ? "vrea să închirieze" : "vrea să cumpere";
    case "wants_parking": return "vrea parcare";
    case "wants_balcony": return "vrea balcon";
    case "furnished": return value ? "vrea mobilat" : "vrea nemobilat";
    case "pets_allowed": return "are animale de companie";
    case "term": return `termen: ${value}`;
    case "property_type": return `tip proprietate: ${value}`;
    default: return `${field}: ${String(value)}`;
  }
}

/** Diferențele propuse față de cererea existentă; cererea nu se modifică. */
export function diffRequest(existing: RequestLike, e: ExtractedRequest): ProposedChange[] {
  const changes: ProposedChange[] = [];
  for (const field of Object.keys(e) as (keyof ExtractedRequest)[]) {
    if (field === "currency") continue;
    const value = e[field];
    if (value === null || (Array.isArray(value) && value.length === 0)) continue;
    const current = existing[field];
    if (Array.isArray(value)) {
      const have = new Set(((current as string[] | null) ?? []).map(fold));
      const missing = value.filter((v) => !have.has(fold(v)));
      if (missing.length) changes.push({ field, value: missing, text: `Clientul a menționat ${describe(field, missing, e.currency)}` });
    } else if (current !== value) {
      changes.push({ field, value, text: `Clientul a menționat ${describe(field, value, e.currency ?? (existing.currency as string | null) ?? null)}` });
    }
  }
  return changes;
}

/** Aplică diferențele aprobate de agent peste cererea existentă (liste: adăugare). */
export function applyChanges(existing: RequestLike, changes: ProposedChange[]): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const c of changes) {
    patch[c.field] = Array.isArray(c.value) ? [...new Set([...((existing[c.field] as string[] | null) ?? []), ...(c.value as string[])])] : c.value;
  }
  return patch;
}

export type DraftProperty = {
  title: string; transaction_kind: string; property_type: string; price: number | null; currency: string;
  rooms: number | null; surface: number | null; usable_surface: number | null; floor: number | null;
  city: string | null; balcony: boolean; parking: string | null; description: string | null;
};

/**
 * Ciorna e respinsă dacă menționează cifre (prețuri, suprafețe etc.) care nu
 * apar în datele proprietății sau în conversație.
 */
export function sanitizeDraft(draft: string | null | undefined, property: DraftProperty | null, conversation: string): string | null {
  const text = draft?.trim();
  if (!text) return null;
  const allowed = new Set<number>([
    ...numbersIn(conversation),
    ...(property ? numbersIn([property.title, property.description ?? ""].join(" ")) : []),
    ...[property?.price, property?.rooms, property?.surface, property?.usable_surface, property?.floor].filter((n): n is number => typeof n === "number"),
  ]);
  const withoutTimes = text.replace(/\b\d{1,2}[:.]\d{2}\b/g, " ");
  for (const n of numbersIn(withoutTimes)) {
    if (n <= 31) continue; // ore, zile, numere mici de camere
    if (![...allowed].some((a) => Math.abs(a - n) < 0.5)) return null;
  }
  return text.slice(0, 1500);
}

export const LEAD_AI_SYSTEM = `Ești asistentul Habitoo pentru agenți imobiliari din România. Primești un mesaj de la un client venit de pe un portal, eventual proprietatea din anunț și ultimele mesaje din conversație.
Răspunde DOAR cu un obiect JSON, fără alt text:
{"request":{"kind":"buy"|"rent"|null,"budget_min":number|null,"budget_max":number|null,"currency":"EUR"|"RON"|"USD"|null,"cities":string[],"areas":string[],"rooms_min":number|null,"rooms_max":number|null,"surface_min":number|null,"property_type":"apartment"|"studio"|"house"|"land"|"commercial"|"office"|null,"wants_parking":boolean|null,"wants_balcony":boolean|null,"furnished":boolean|null,"pets_allowed":boolean|null,"term":string|null},"intent":"viewing"|"question"|"negotiation"|"other","language":"ro"|"en"|...,"draft":string}
Reguli:
- În "request" pune doar ce a spus clientul explicit în mesaj. Orice altceva rămâne null sau listă goală. Nu deduce din proprietate.
- "intent": viewing = vrea să vadă proprietatea; question = întreabă ceva; negotiation = discută prețul; other = altceva.
- "draft": răspuns scurt și politicos (2–4 fraze), în limba clientului (implicit română), semnat neutru, fără nume. Răspunde la întrebare doar din datele proprietății primite. Nu inventa prețuri, suprafețe, adrese, disponibilitate sau alte detalii; dacă informația lipsește, spune că revii cu detalii. Propune pasul următor (de exemplu o vizionare), fără să confirmi o oră anume.`;

export function buildLeadAiRequest(input: { message: string; property: DraftProperty | null; history: { direction: string; body: string }[] }) {
  const p = input.property;
  const propertyText = p
    ? JSON.stringify({ titlu: p.title, tranzactie: p.transaction_kind, tip: p.property_type, pret: p.price, moneda: p.currency, camere: p.rooms, suprafata: p.surface, suprafata_utila: p.usable_surface, etaj: p.floor, localitate: p.city, balcon: p.balcony, parcare: p.parking, descriere: p.description?.slice(0, 1200) ?? null })
    : "Nu există proprietate asociată.";
  const history = input.history.length
    ? input.history.map((m) => `${m.direction === "out" ? "Agent" : "Client"}: ${m.body.slice(0, 600)}`).join("\n")
    : "Nu există mesaje anterioare.";
  return {
    system: LEAD_AI_SYSTEM,
    messages: [{ role: "user" as const, content: `Proprietatea din anunț: ${propertyText}\n\nUltimele mesaje:\n${history}\n\nMesajul nou al clientului: """${input.message.slice(0, 3000)}"""` }],
    tools: [],
    maxOutputTokens: 1500,
  };
}
