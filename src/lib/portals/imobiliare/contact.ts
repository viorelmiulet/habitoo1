/** Reguli unice pentru numerele trimise către Imobiliare.ro. */
export function normalizeImobiliarePhone(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/[^\d]/g, "");
  if (!digits) return null;
  let local = digits;
  if (local.startsWith("0040")) local = local.slice(4);
  else if (local.startsWith("40") && local.length >= 11) local = local.slice(2);
  if (!local.startsWith("0")) local = `0${local}`;
  return /^0\d{9}$/.test(local) ? local : null;
}

export function resolveImobiliareContactPhone(
  ...candidates: (string | null | undefined)[]
): string | null {
  for (const candidate of candidates) {
    const normalized = normalizeImobiliarePhone(candidate);
    if (normalized) return normalized;
  }
  return null;
}