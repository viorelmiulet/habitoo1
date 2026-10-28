/**
 * Cheia de agenție ZonaTa (https://zonata.ro/api): `zt_live_…` = producție,
 * `zt_test_…` = mod test (validează tot, nu salvează nimic).
 * Pură și browser-safe: aceeași verificare rulează în formular și la salvare.
 */
export type ZonataKeyMode = "live" | "test";

export const ZONATA_KEY_PATTERN = /^zt_(live|test)_[A-Za-z0-9_-]{8,200}$/;

export const ZONATA_KEY_FORMAT_MESSAGE =
  "Cheia ZonaTa trebuie să înceapă cu zt_live_ (producție) sau zt_test_ (mod test). Agenția o creează în contul ZonaTa, la Contul meu → API.";

export const ZONATA_KEY_MODE_LABEL: Record<ZonataKeyMode, string> = { live: "Live", test: "Test" };

export function normalizeZonataKey(raw: string | null | undefined): string {
  return (raw ?? "").trim();
}

export function isValidZonataKey(raw: string | null | undefined): boolean {
  return ZONATA_KEY_PATTERN.test(normalizeZonataKey(raw));
}

/** Modul cheii, derivat doar din prefixul public; null dacă formatul e greșit. */
export function zonataKeyMode(raw: string | null | undefined): ZonataKeyMode | null {
  const m = ZONATA_KEY_PATTERN.exec(normalizeZonataKey(raw));
  return m ? (m[1] as ZonataKeyMode) : null;
}
