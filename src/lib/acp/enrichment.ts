/**
 * Îmbogățirea AI a ofertelor de piață pentru ACP — reguli pure.
 *
 * AI-ul NU calculează prețuri: doar extrage câmpuri descriptive din textul
 * anunțului, fiecare cu încredere 0–1. Motorul ACP le folosește doar peste
 * `ACP_ENRICH_MIN_CONFIDENCE` și niciodată nu suprascrie datele originale.
 */
import { z } from "zod";

export const ACP_ENRICH_PROMPT_VERSION = "acp-enrich-2";
export const ACP_ENRICH_CAPABILITY = "acp_enrich";
export const ACP_ENRICH_MIN_CONFIDENCE = 0.7;
/** Plafon lunar de cost (USD), verificat înaintea fiecărui apel. */
export const ACP_ENRICH_MONTHLY_BUDGET_USD = 5;
/** Anunțuri trimise într-un singur apel AI. */
export const ACP_ENRICH_BATCH_SIZE = 10;
/** Loturi per rulare: anunțuri noi (15 min) și restanța de noapte. */
export const ACP_ENRICH_RUN_LIMITS = { new: 20, backlog: 60 } as const;
/** Utilizator tehnic pentru evenimentele de consum ale jobului de fundal. */
export const ACP_ENRICH_SYSTEM_USER = "00000000-0000-0000-0000-000000000000";

/**
 * Tarife pentru calculul costului (USD per 1M tokeni). Valori de lucru,
 * configurabile; costul real se calculează din tokenii raportați de provider.
 */
export const ACP_ENRICH_PRICING: Record<string, { input: number; output: number }> = {
  minimax: { input: 0.3, output: 1.2 },
  gemini: { input: 0.5, output: 3 },
};

export function enrichCostUsd(provider: string, inputTokens: number | null, outputTokens: number | null): number {
  const rate = ACP_ENRICH_PRICING[provider] ?? ACP_ENRICH_PRICING["gemini"]!;
  return ((inputTokens ?? 0) * rate.input + (outputTokens ?? 0) * rate.output) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Redactare: la AI pleacă doar textul despre proprietate.

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const URL = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
// Telefoane RO/internaționale: +40 7xx xxx xxx, 07xx.xxx.xxx, 021 xxx xx xx etc.
const PHONE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
// Nume după cuvinte de contact („Contact: Ion Popescu”, „dna Maria”, „agent Andrei”).
const NAME_AFTER = /\b(contact(?:ati|ează|eaza|ați)?|persoan[aă] de contact|sun[aă]ți|sunati|suna[țt]i-?m[aă]|agent(?:ul)?|consultant(?:ul)?|d-?na|dna|d-?l|dl|domnul|doamna|ing\.?|proprietar(?:ul)?)\s*[:\-–]?\s*((?:[A-ZĂÂÎȘŞȚŢ][a-zăâîșşțţ]+|[A-ZĂÂÎȘŞȚŢ]{2,})(?:[\s-]+(?:[A-ZĂÂÎȘŞȚŢ][a-zăâîșşțţ]+|[A-ZĂÂÎȘŞȚŢ]{2,})){0,2})/gi;

export function redactListingText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(EMAIL, "[email]")
    .replace(URL, "[link]")
    .replace(NAME_AFTER, (_m, word: string) => `${word} [nume]`)
    .replace(PHONE, (match) => {
      const digits = match.replace(/\D/g, "");
      // Prețuri/suprafețe (ex. 76 500, 2.054) nu sunt telefoane: doar 9–13 cifre.
      return digits.length >= 9 && digits.length <= 13 ? "[telefon]" : match;
    })
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2500);
}

export type EnrichInputListing = {
  id: string;
  title: string | null;
  description?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  property_type: string | null;
  transaction_type: string | null;
  price: number | null;
  currency: string | null;
  usable_area: number | null;
  total_area?: number | null;
  rooms: number | null;
  floor: number | null;
  raw_data?: unknown;
};

function rawSurface(raw: unknown): number | null {
  const value = (raw as { original?: { surface?: unknown } } | null)?.original?.surface;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Doar câmpuri despre proprietate; fără URL, sursă, telefoane sau identificatori. */
export function enrichPayload(listing: EnrichInputListing, ref: string) {
  return {
    ref,
    titlu: redactListingText(listing.title),
    descriere: redactListingText(listing.description ?? ""),
    zona: redactListingText([listing.neighborhood, listing.address, listing.city].filter(Boolean).join(", ")),
    tip: listing.property_type,
    tranzactie: listing.transaction_type,
    pret: listing.price,
    moneda: listing.currency,
    suprafata_mp: listing.usable_area ?? listing.total_area ?? rawSurface(listing.raw_data),
    camere: listing.rooms,
    etaj: listing.floor,
  };
}

export function enrichInputHash(listing: EnrichInputListing): string {
  const payload = JSON.stringify(enrichPayload(listing, "x"));
  let h = 2166136261;
  for (let i = 0; i < payload.length; i += 1) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${ACP_ENRICH_PROMPT_VERSION}:${(h >>> 0).toString(16)}`;
}

export const ACP_ENRICH_SYSTEM_PROMPT = `Ești un extractor de date pentru anunțuri imobiliare din România. NU estimezi și NU corectezi prețuri.
Pentru fiecare anunț primit întorci câmpuri extrase din text, fiecare cu încredere între 0 și 1 (1 = scris explicit, 0.5 = dedus, sub 0.3 = ghicit). Dacă textul nu spune, întoarce null și încredere 0.
- complex: numele ansamblului rezidențial menționat explicit (ex. „Militari Residence”, „Renew Residence”, „Cosmopolis”), altfel null. Nu inventa ansambluri din numele cartierului.
- stare: una dintre bloc_nou, finisat, semifinisat, renovat, de_renovat, sau null.
- tip_real: garsoniera, apartament, casa, vila, teren, spatiu_comercial, birou, altul. Garsoniera = apartament cu 1 cameră.
- camere și etaj: numere, doar dacă reies din text (parter = 0, demisol = -1, mansardă = etajul ultim).
- pret_suspect: true doar dacă prețul pare greșit pentru tranzacția și tipul anunțului: chirie lunară pusă la vânzare (pret_suspect_tip = chirie_la_vanzare), preț pe m² în loc de total (pret_pe_mp), avans în loc de preț total (avans), altă monedă (moneda), altceva (altul). Prețurile mici la închiriere sunt normale. Dă motivul scurt, în română, folosind doar cifrele din anunțul respectiv.
Fiecare anunț se judecă izolat: nu folosi niciodată date (suprafețe, prețuri, nume) din alte anunțuri ale listei. Nu inventa suprafețe care nu apar.
Răspunde exclusiv cu JSON valid.`;

const conf = z.number().min(0).max(1);
const ItemSchema = z.object({
  ref: z.string(),
  complex: z.string().max(80).nullable(),
  complex_incredere: conf,
  stare: z.enum(["bloc_nou", "finisat", "semifinisat", "renovat", "de_renovat"]).nullable(),
  stare_incredere: conf,
  tip_real: z.string().max(40).nullable(),
  tip_real_incredere: conf,
  camere: z.number().min(0).max(20).nullable(),
  camere_incredere: conf,
  etaj: z.number().int().min(-2).max(60).nullable(),
  etaj_incredere: conf,
  pret_suspect: z.boolean(),
  pret_suspect_incredere: conf,
  pret_suspect_tip: z.enum(["chirie_la_vanzare", "pret_pe_mp", "avans", "moneda", "altul"]).nullable(),
  pret_suspect_motiv: z.string().max(200).nullable(),
});
export type AcpEnrichItem = z.infer<typeof ItemSchema>;

export const ACP_ENRICH_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["anunturi"],
  properties: {
    anunturi: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: Object.keys(ItemSchema.shape),
        properties: {
          ref: { type: "string" },
          complex: { type: ["string", "null"] },
          complex_incredere: { type: "number" },
          stare: { type: ["string", "null"], enum: ["bloc_nou", "finisat", "semifinisat", "renovat", "de_renovat", null] },
          stare_incredere: { type: "number" },
          tip_real: { type: ["string", "null"] },
          tip_real_incredere: { type: "number" },
          camere: { type: ["number", "null"] },
          camere_incredere: { type: "number" },
          etaj: { type: ["integer", "null"] },
          etaj_incredere: { type: "number" },
          pret_suspect: { type: "boolean" },
          pret_suspect_incredere: { type: "number" },
          pret_suspect_tip: { type: ["string", "null"], enum: ["chirie_la_vanzare", "pret_pe_mp", "avans", "moneda", "altul", null] },
          pret_suspect_motiv: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

/** Extrage obiectul JSON (tolerant la ```json``` sau text în jur) și validează fiecare anunț. */
export function parseEnrichResponse(raw: string): { ok: boolean; items: Map<string, AcpEnrichItem> } {
  const items = new Map<string, AcpEnrichItem>();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return { ok: false, items };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { ok: false, items };
  }
  const list = (parsed as { anunturi?: unknown })?.anunturi;
  if (!Array.isArray(list)) return { ok: false, items };
  for (const entry of list) {
    const result = ItemSchema.safeParse(entry);
    if (result.success) items.set(result.data.ref, result.data);
  }
  return { ok: items.size > 0, items };
}

// ---------------------------------------------------------------------------
// Folosirea în ACP (doar peste pragul de încredere).

export type AcpEnrichmentRow = {
  status: string;
  complex_name: string | null;
  complex_confidence: number | null;
  condition: string | null;
  condition_confidence: number | null;
  real_property_type: string | null;
  real_property_type_confidence: number | null;
  rooms: number | null;
  rooms_confidence: number | null;
  floor: number | null;
  floor_confidence: number | null;
  price_suspect: boolean | null;
  price_suspect_confidence: number | null;
  price_suspect_reason: string | null;
  price_suspect_kind?: string | null;
};

/** Starea AI → eticheta pe care o înțeleg scoring-ul și ajustările ACP. */
const CONDITION_FOR_ACP: Record<string, string> = {
  bloc_nou: "nou",
  finisat: "buna",
  semifinisat: "nefinisat",
  renovat: "renovat",
  de_renovat: "necesita renovare",
};

const ok = (value: number | null | undefined) =>
  typeof value === "number" && Number(value) >= ACP_ENRICH_MIN_CONFIDENCE;

export type AcpEnrichmentUse = {
  complexName: string | null;
  condition: string | null;
  rooms: number | null;
  floor: number | null;
  priceSuspectReason: string | null;
};

/** Ce poate folosi motorul: doar câmpurile cu încredere ≥ 0,7, doar unde originalul lipsește. */
export function usableEnrichment(
  row: AcpEnrichmentRow | null | undefined,
  original: { rooms?: number | null; floor?: number | null; condition?: string | null },
): AcpEnrichmentUse | null {
  if (!row || row.status !== "ok") return null;
  const studio = ok(row.real_property_type_confidence) && /garsonier|studio/.test(row.real_property_type ?? "");
  const rooms =
    original.rooms == null
      ? studio
        ? 1
        : ok(row.rooms_confidence) && row.rooms !== null
          ? Number(row.rooms)
          : null
      : null;
  return {
    complexName: ok(row.complex_confidence) && row.complex_name ? row.complex_name : null,
    condition:
      !original.condition && ok(row.condition_confidence) && row.condition
        ? (CONDITION_FOR_ACP[row.condition] ?? null)
        : null,
    rooms,
    floor: original.floor == null && ok(row.floor_confidence) && row.floor !== null ? Number(row.floor) : null,
    // „altul” nu exclude: doar tipurile de eroare clare și verificabile.
    priceSuspectReason:
      row.price_suspect && ok(row.price_suspect_confidence) && row.price_suspect_kind && row.price_suspect_kind !== "altul"
        ? row.price_suspect_reason || "preț suspect"
        : null,
  };
}

/** Rând de salvat pentru un anunț (datele originale ale anunțului rămân neatinse). */
export function enrichmentRow(item: AcpEnrichItem) {
  const n = (v: number) => Math.round(v * 100) / 100;
  return {
    complex_name: item.complex?.trim() || null,
    complex_confidence: n(item.complex_incredere),
    condition: item.stare,
    condition_confidence: n(item.stare_incredere),
    real_property_type: item.tip_real?.trim().toLowerCase() || null,
    real_property_type_confidence: n(item.tip_real_incredere),
    rooms: item.camere,
    rooms_confidence: n(item.camere_incredere),
    floor: item.etaj,
    floor_confidence: n(item.etaj_incredere),
    price_suspect: item.pret_suspect,
    price_suspect_confidence: n(item.pret_suspect_incredere),
    price_suspect_reason: item.pret_suspect ? item.pret_suspect_motiv : null,
    price_suspect_kind: item.pret_suspect ? item.pret_suspect_tip : null,
  };
}
