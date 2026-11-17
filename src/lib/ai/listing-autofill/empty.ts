/** Shared emptiness semantics: zero counts are unspecified unless explicitly selected. */
export const AUTOFILL_COUNT_FIELDS = new Set([
  "rooms", "bedrooms", "bathrooms", "kitchens", "balconies", "terraces", "parking_spaces", "garages", "building_floors",
]);

export function isAutofillEmpty(key: string, value: unknown): boolean {
  return value == null || value === "" || value === false ||
    (Array.isArray(value) && value.length === 0) ||
    (AUTOFILL_COUNT_FIELDS.has(key) && (value === 0 || value === "0"));
}

export function isAutofillFieldEmpty(current: Record<string, unknown>, key: string): boolean {
  const chosen = current["__autofillChosen"];
  if (Array.isArray(chosen) && chosen.includes(key) && current[key] != null && current[key] !== "") return false;
  return isAutofillEmpty(key, current[key]);
}

/** New-form defaults are not facts. Explicit choices (even zero) stay protected. */
export function withoutUnchosenDefaults(
  current: Record<string, unknown>,
  defaults: Record<string, unknown>,
  chosen: ReadonlySet<string>,
): Record<string, unknown> {
  const out = { ...current };
  for (const [key, value] of Object.entries(out)) {
    if (chosen.has(key)) continue;
    if (isAutofillEmpty(key, value) || (key in defaults && value === defaults[key])) delete out[key];
  }
  out["__autofillChosen"] = [...chosen];
  return out;
}