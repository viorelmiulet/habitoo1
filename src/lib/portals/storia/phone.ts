/**
 * Normalizează telefonul primit de la Storia în format internațional, fără
 * spații (`+40…`). Acceptă text sau număr; numerele românești fără zero
 * inițial (pierdut la serializare numerică, ex. `722123456`) sunt refăcute.
 */
export function normalizeStoriaPhone(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const input = String(raw).trim();
  if (!input) return null;
  const plus = input.startsWith("+");
  let digits = input.replace(/\D/g, "");
  if (!digits) return null;
  if (!plus && digits.startsWith("00")) return digits.length > 4 ? `+${digits.slice(2)}` : null;
  if (plus) return digits.length >= 8 ? `+${digits}` : null;
  if (digits.startsWith("40") && digits.length === 11) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) return `+40${digits.slice(1)}`;
  // Număr românesc fără zero inițial (mobil 7xx, fix 2xx/3xx).
  if (digits.length === 9 && /^[237]/.test(digits)) return `+40${digits}`;
  digits = digits.replace(/^0+/, "");
  return digits.length >= 8 ? `+${digits}` : null;
}
