/**
 * Rezumatul „Completat de AI” afișat lângă buton după o rulare:
 * rânduri pure (etichetă, valoare formatată, sursă), fără stare și fără DB.
 */
import {
  AUTOFILL_SOURCE_LABELS,
  autofillFieldLabel,
  type AutofillProposal,
  type AutofillValue,
} from "./schema";

const SURFACE_KEYS = new Set([
  "usable_surface",
  "built_surface",
  "total_usable_surface",
  "balcony_surface",
  "terrace_surface",
  "garden_surface",
  "land_surface",
]);

/** Valoarea afișată în rezumat: „Da” pentru boolean, listă cu virgulă, „mp” la suprafețe. */
export function formatAutofillValue(key: string, value: AutofillValue): string {
  if (typeof value === "boolean") return value ? "Da" : "Nu";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "number") return SURFACE_KEYS.has(key) ? `${value} mp` : String(value);
  return value;
}

export type AutofillSummaryRow = {
  key: string;
  label: string;
  /** Valoarea formatată; pentru titlu/descriere doar „generat”/„generată”. */
  value: string;
  /** Eticheta sursei („din descriere”, „din text”, „din poze”, „dedus”) sau null. */
  source: string | null;
  /** Confidence „medium” → marcaj „de verificat”. */
  check: boolean;
};

/** Rândurile rezumatului, doar pentru câmpurile încă marcate „AI” în formular. */
export function autofillSummaryRows(proposal: AutofillProposal, marked: readonly string[]): AutofillSummaryRow[] {
  const rows: AutofillSummaryRow[] = [];
  for (const key of marked) {
    if (key === "title") {
      if (proposal.title) rows.push({ key, label: "Titlu", value: "generat", source: null, check: false });
      continue;
    }
    if (key === "description") {
      if (proposal.description) rows.push({ key, label: "Descriere", value: "generată", source: null, check: false });
      continue;
    }
    if (!(key in proposal.values)) continue;
    const source = proposal.sources?.[key];
    rows.push({
      key,
      label: autofillFieldLabel(key),
      value: formatAutofillValue(key, proposal.values[key]!),
      source: source ? AUTOFILL_SOURCE_LABELS[source] : null,
      check: proposal.confidence[key] === "medium",
    });
  }
  return rows;
}

/** „1 câmp”, „3 câmpuri”, „20 de câmpuri” (regula numeralelor). */
export function autofillCountLabel(count: number): string {
  if (count === 1) return "1 câmp";
  const lastTwo = count % 100;
  if (lastTwo === 0 || (lastTwo >= 20 && lastTwo <= 99)) return `${count} de câmpuri`;
  return `${count} câmpuri`;
}
