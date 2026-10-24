import { normalizePlace, normalizePropertyType, normalizeTransactionType } from "./normalize";

export function marketPoolScope(target: { city?: string | null; propertyType?: string | null; transactionType?: string | null }) {
  const city = normalizePlace(target.city);
  const sector = city && /^sector(?:ul)? [1-6]$/.test(city) ? city.replace("sectorul", "sector") : null;
  return {
    city: sector ? "bucuresti" : city,
    sector,
    propertyType: normalizePropertyType(target.propertyType),
    transactionType: normalizeTransactionType(target.transactionType),
  };
}