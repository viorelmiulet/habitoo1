/**
 * Normalizarea itemilor colectați — logică pură.
 *
 * Telefonul: normalizat la E.164 doar în memorie, ca să poată fi hash-uit;
 * numărul în clar nu se scrie niciodată nicăieri (nici în bază, nici în
 * jurnale, nici în erori). Imaginile: doar adrese URL, niciodată conținut.
 */

export type CollectorNormalizedFields = {
  title?: string | null;
  description?: string | null;
  price?: number | null;
  currency?: string | null;
  rooms?: number | null;
  area?: number | null;
  city?: string | null;
  county?: string | null;
  transaction?: string | null;
  propertyType?: string | null;
  imageUrls?: string[];
};

/** Telefon românesc sau internațional → E.164; null dacă nu e plauzibil. */
export function normalizePhoneE164(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/[^\d+]/g, "");
  if (!digits) return null;
  let value = digits.startsWith("+") ? digits.slice(1) : digits;
  value = value.replace(/\D/g, "");
  if (!value) return null;

  if (value.startsWith("0040")) value = value.slice(2);
  if (value.startsWith("40") && value.length >= 11) {
    // deja internațional
  } else if (value.startsWith("0")) {
    value = `40${value.slice(1)}`;
  } else if (value.length === 9 && value.startsWith("7")) {
    value = `40${value}`;
  }
  if (value.length < 10 || value.length > 15) return null;
  return `+${value}`;
}

/** Orice text care arată ca un număr de telefon — folosit de teste și de gărzi. */
export const PHONE_SHAPED = /(?:\+?\d[\s().-]?){9,}/;

export function looksLikePhone(value: unknown): boolean {
  return typeof value === "string" && PHONE_SHAPED.test(value.replace(/\s+/g, " "));
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return String(Math.round(value * 100) / 100);
}

/** Cheia stabilă de conținut: aceleași câmpuri → același hash. */
export function listingHashInput(fields: CollectorNormalizedFields): string {
  return [
    normalizeText(fields.title),
    normalizeText(fields.description).slice(0, 500),
    normalizeNumber(fields.price),
    normalizeText(fields.currency),
    normalizeNumber(fields.rooms),
    normalizeNumber(fields.area),
    normalizeText(fields.city),
    normalizeText(fields.county),
    normalizeText(fields.transaction),
    normalizeText(fields.propertyType),
    (fields.imageUrls ?? []).map((url) => url.trim()).sort().join(","),
  ].join("|");
}

/** Doar adrese de imagini publice; nimic nu se descarcă. */
export function sanitizeImageUrls(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  const out: string[] = [];
  for (const raw of urls) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!/^https?:\/\//i.test(trimmed)) continue;
    if (!out.includes(trimmed)) out.push(trimmed);
  }
  return out;
}

export type SellerTypeSignals = {
  itemsCount?: number | null;
  declaredAgency?: boolean | null;
  declaredOwner?: boolean | null;
};

/** Proprietar / agenție doar din semnale explicite sau volum; altfel necunoscut. */
export function inferSellerType(signals: SellerTypeSignals): "owner" | "agency" | "unknown" {
  if (signals.declaredAgency) return "agency";
  if (signals.declaredOwner) return "owner";
  const count = signals.itemsCount ?? 0;
  if (count >= 5) return "agency";
  if (count === 1) return "unknown";
  return "unknown";
}
