/**
 * Cheia de agenție imo24.ro: `i24_` + 8 caractere hex + `_` + 40 caractere hex
 * (specificația OpenAPI imo24 v1.0.1, schema de securitate `bearer`).
 * Pură și browser-safe: aceeași verificare rulează în formular și la salvare.
 */
export const IMO24_KEY_PATTERN = /^i24_[0-9a-f]{8}_[0-9a-f]{40}$/i;

export const IMO24_KEY_FORMAT_MESSAGE =
  "Cheia imo24.ro are formatul i24_ + 8 caractere hex + _ + 40 caractere hex. Copiaz-o din panoul agenției imo24.ro.";

export function normalizeImo24Key(raw: string | null | undefined): string {
  return (raw ?? "").trim();
}

export function isValidImo24Key(raw: string | null | undefined): boolean {
  return IMO24_KEY_PATTERN.test(normalizeImo24Key(raw));
}

/** Prefixul public al cheii (8 hex), sigur de afișat; null dacă formatul e greșit. */
export function imo24KeyPrefix(raw: string | null | undefined): string | null {
  const key = normalizeImo24Key(raw);
  return IMO24_KEY_PATTERN.test(key) ? key.slice(4, 12).toLowerCase() : null;
}
