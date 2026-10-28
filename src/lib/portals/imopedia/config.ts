/** Validarea ID-ului de agenție Imopedia (AGENTIA): întreg ≥ 1. Folosit în UI și server. */
export const IMOPEDIA_AGENCY_ID_MESSAGE = "„ID agenție Imopedia (AGENTIA)” trebuie să fie un număr întreg ≥ 1.";

export function parseImopediaAgencyId(value: unknown): number | null {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}
