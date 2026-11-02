/**
 * Regula comună pentru poze parțiale: anunțul acceptat de portal cu mai puține
 * poze decât are Habitoo e o publicare reușită cu avertisment, nu o eroare.
 */
export function photoWarning(sent: number, total: number, reasons: readonly string[] = []): string | null {
  if (!Number.isFinite(total) || total <= 0 || sent >= total) return null;
  const why = reasons.map((r) => r.trim()).filter(Boolean);
  return `${Math.max(0, sent)} din ${total} poze trimise${why.length ? ` – ${[...new Set(why)].join(" ")}` : "."}`;
}

/** Combină avertismentele mai multor anunțuri (ex. vânzare + închiriere). */
export function joinWarnings(list: readonly (string | null | undefined)[]): string | null {
  const out = [...new Set(list.filter((w): w is string => Boolean(w)))];
  return out.length ? out.join(" ") : null;
}
