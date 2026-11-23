/**
 * Sugestiile AI ale verificării anunțului (etapa 2) — validare pură, browser-safe.
 * AI-ul doar propune; serverul păstrează numai ce poate fi verificat din câmpurile
 * anunțului. Nimic nu se salvează fără acțiunea agentului.
 */
import { FEATURE_KEYWORDS, TITLE_MAX, excessiveCaps, repeatedMarks } from "./rules";

/** Câmpurile numerice care se pot deduce sigur din descriere. */
export const DEDUCIBLE_FIELDS = {
  floor: { label: "Etaj", min: -1, max: 60 },
  building_floors: { label: "Număr de etaje", min: 0, max: 60 },
  rooms: { label: "Camere", min: 1, max: 30 },
  bedrooms: { label: "Dormitoare", min: 0, max: 30 },
  bathrooms: { label: "Băi", min: 0, max: 20 },
  build_year: { label: "An construcție", min: 1800, max: 2100 },
  usable_surface: { label: "Suprafață utilă", min: 5, max: 100000 },
  built_surface: { label: "Suprafață construită", min: 5, max: 100000 },
  land_surface: { label: "Suprafață teren", min: 5, max: 10000000 },
} as const;
export type DeducibleField = keyof typeof DEDUCIBLE_FIELDS;

export type PriceContext = { medianPerSqm: number; comparables: number; scope: string };
export type AiDeducedField = { field: DeducibleField; label: string; value: number; evidence: string };
export type AiListingSuggestions = {
  title: string | null;
  description: string | null;
  fields: AiDeducedField[];
  questions: string[];
  price: { note: string; source: string } | null;
  /** Propuneri respinse de verificarea serverului (fără conținut, doar motivul). */
  dropped: string[];
};
export type AiSuggestionsResponse =
  | { ok: true; suggestions: AiListingSuggestions }
  | { ok: false; disabled: true; message: string }
  | { ok: false; disabled: false; message: string };

const norm = (s: string) => s.toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();
const numbersIn = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", "."));

/** Textul sursă al anunțului: toate câmpurile permise, ca text simplu. */
export function sourceText(property: Record<string, unknown>): string {
  return Object.values(property).map((v) => (Array.isArray(v) ? v.join(" ") : v == null ? "" : String(v))).join(" \n ");
}

/** Dotări menționate de text care nu există în câmpuri sau în textul original. */
export function inventedFeatures(text: string, property: Record<string, any>): string[] {
  const original = `${property.title ?? ""} ${property.description ?? ""}`;
  return FEATURE_KEYWORDS.filter((f) => {
    if (!f.pattern.test(text)) return false;
    if (new RegExp(`\\b(?:fără|fara|nu are)\\s+(?:${f.pattern.source})`, "i").test(text)) return false;
    return !f.present(property) && !f.pattern.test(original);
  }).map((f) => f.label);
}

/** Cifre din text care nu apar în niciun câmp al anunțului (suprafețe, distanțe inventate). */
export function inventedNumbers(text: string, property: Record<string, unknown>): string[] {
  const known = new Set(numbersIn(sourceText(property)).flatMap((n) => [n, String(Number(n))]));
  return [...new Set(numbersIn(text).filter((n) => !known.has(n) && !known.has(String(Number(n)))))];
}

function isEmpty(v: unknown) {
  return v === null || v === undefined || v === "" || (typeof v === "number" && Number.isNaN(v));
}

/**
 * Validează răspunsul brut al AI-ului. Orice formă invalidă → null (panoul rămâne
 * doar cu regulile). Propunerile neverificabile se elimină individual.
 */
export function validateAiSuggestions(raw: unknown, property: Record<string, any>, price: PriceContext | null): AiListingSuggestions | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const nullableText = (v: unknown) => v === null || typeof v === "string";
  if (!nullableText(r.title) || !nullableText(r.description) || !nullableText(r.price_note)
    || !Array.isArray(r.fields) || !Array.isArray(r.questions)
    || !r.questions.every((q) => typeof q === "string")) return null;
  const dropped: string[] = [];
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  let title = str(r.title);
  if (title !== null && (title.length >= TITLE_MAX || excessiveCaps(title) || repeatedMarks(title) || inventedNumbers(title, property).length > 0 || inventedFeatures(title, property).length > 0)) {
    dropped.push("Titlul propus nu respecta regulile și a fost eliminat.");
    title = null;
  }
  let description = str(r.description);
  if (description !== null) {
    const feats = inventedFeatures(description, property);
    const nums = inventedNumbers(description, property);
    if (feats.length || nums.length || description.length > 6000) {
      dropped.push("Descrierea propusă conținea informații care nu există în anunț și a fost eliminată.");
      description = null;
    }
  }

  const fields: AiDeducedField[] = [];
  const desc = norm(String(property.description ?? ""));
  for (const item of Array.isArray(r.fields) ? r.fields : []) {
    if (!item || typeof item !== "object") continue;
    const { field, value, evidence } = item as Record<string, unknown>;
    if (typeof field !== "string" || !(field in DEDUCIBLE_FIELDS)) continue;
    const spec = DEDUCIBLE_FIELDS[field as DeducibleField];
    const n = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(",", ".")) : NaN;
    const ev = typeof evidence === "string" ? evidence.trim() : "";
    const ok = Number.isFinite(n) && n >= spec.min && n <= spec.max && isEmpty(property[field])
      && ev.length >= 3 && desc.includes(norm(ev)) && numbersIn(ev).some((x) => Number(x) === n)
      && !fields.some((f) => f.field === field);
    if (!ok) { dropped.push(`${spec.label}: propunere fără dovadă în descriere.`); continue; }
    fields.push({ field: field as DeducibleField, label: spec.label, value: n, evidence: ev });
  }

  const questions = (Array.isArray(r.questions) ? r.questions : [])
    .map(str).filter((q): q is string => q !== null && q.length <= 300).slice(0, 8);

  let priceNote: AiListingSuggestions["price"] = null;
  const note = str(r.price_note);
  if (note && price) {
    priceNote = { note: note.slice(0, 500), source: `${price.comparables} anunțuri comparabile din Habitoo (${price.scope}); mediană ${Math.round(price.medianPerSqm)} €/m²` };
  } else if (note) dropped.push("Observația de preț a fost eliminată: nu există comparabile în Habitoo.");

  return { title, description, fields, questions, price: priceNote, dropped };
}

/** Extrage JSON-ul din textul modelului (acceptă și blocuri ```json). */
export function parseAiJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(t); } catch { return null; }
}
