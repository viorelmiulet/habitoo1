// Lista publică a agențiilor partenere: doar nume și logo. Fără alte date.
export type PublicPartner = { name: string; logoUrl: string | null };

/** Singurele chei pe care le poate avea un partener trimis către pagina publică. */
export const PUBLIC_PARTNER_KEYS = ["name", "logoUrl"] as const;

export function partnerLogoUrl(id: string): string {
  return `/api/public/partner-logo/${id}`;
}

export function toPublicPartners(rows: { id: string; name: string; has_logo: boolean }[]): PublicPartner[] {
  return rows
    .map((r) => ({ name: r.name, logoUrl: r.has_logo ? partnerLogoUrl(r.id) : null }))
    .sort((a, b) => a.name.localeCompare(b.name, "ro"));
}

export function partnerInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}
