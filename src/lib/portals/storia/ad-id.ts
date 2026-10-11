/**
 * Slugul din URL-ul unui anunț Storia este id-ul numeric (`data.ad_id`) scris
 * în baza 62 (ex. 10678293 → `INUx`, 10610239 → `IwcT`).
 */
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function storiaAdIdToSlug(id: number): string | null {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  let n = id;
  let out = "";
  while (n > 0) {
    out = ALPHABET[n % 62] + out;
    n = Math.floor(n / 62);
  }
  return out;
}

/** `ad_id` numeric → slug; alfanumeric → folosit direct; altfel null. */
export function storiaAdSlugFromAdId(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (/^\d+$/.test(value)) return storiaAdIdToSlug(Number(value));
  return /^[A-Za-z0-9]{2,}$/.test(value) ? value : null;
}
