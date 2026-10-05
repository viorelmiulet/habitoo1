// Reguli comune pentru profilurile publice (agenție și agent). Fără date nepublice.
export const PUBLIC_AGENCY_DESCRIPTION_MAX = 600;
export const PUBLIC_AGENT_BIO_MAX = 400;
export const PUBLIC_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Echivalentul TS al funcției SQL `public_slugify`. */
export function publicSlugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function publicSlugError(slug: string): string | null {
  if (!slug) return null;
  if (slug.length > 80) return "Adresa poate avea cel mult 80 de caractere.";
  if (!PUBLIC_SLUG_PATTERN.test(slug))
    return "Folosește doar litere mici, cifre și cratimă (fără diacritice sau spații).";
  return null;
}

/** Câmpurile pe care le pot returna funcțiile publice. Nimic altceva. */
export const PUBLIC_AGENCY_LIST_KEYS = ["slug", "name", "city", "description", "logo_path"] as const;
export const PUBLIC_AGENCY_DETAIL_KEYS = [...PUBLIC_AGENCY_LIST_KEYS, "agents"] as const;
export const PUBLIC_AGENT_KEYS = ["slug", "full_name", "job_title", "bio", "avatar_path", "phone"] as const;
