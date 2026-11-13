/**
 * Clasa energetică a anunțului: lista canonică afișată în formular și
 * normalizarea valorilor vechi (din importuri). Browser-safe, fără citiri.
 * Valorile necunoscute nu se pierd: rămân afișate ca atare.
 */
export const ENERGY_CLASS_OPTIONS = ["A++", "A+", "A", "B", "C", "D", "E", "F", "G"] as const;

const CANONICAL = new Map<string, string>(
  ENERGY_CLASS_OPTIONS.map((o) => [o.toUpperCase(), o]),
);

/**
 * Normalizează o valoare salvată la forma din listă dacă e echivalentă
 * („a+” → „A+”, „ a ” → „A”); altfel o returnează curățată, neschimbată.
 */
export function normalizeEnergyClass(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return CANONICAL.get(trimmed.toUpperCase()) ?? trimmed;
}
