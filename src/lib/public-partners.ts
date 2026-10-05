// Lista publică a agențiilor partenere și paginile lor de profil.
// Pagina de listă primește doar nume, slug și logo. Profilul adaugă descrierea
// agenției și agenții ei publici; telefonul unui agent apare doar când acesta
// a ales să-l facă public (public_show_phone).
export type PublicPartner = { name: string; logoUrl: string | null; slug: string | null };

/** Singurele chei pe care le poate avea un partener trimis către pagina publică. */
export const PUBLIC_PARTNER_KEYS = ["name", "logoUrl", "slug"] as const;

export function partnerLogoUrl(id: string): string {
  return `/api/public/partner-logo/${id}`;
}

export function toPublicPartners(
  rows: { id: string; name: string; has_logo: boolean; public_slug: string | null }[],
): PublicPartner[] {
  return rows
    .map((r) => ({ name: r.name, logoUrl: r.has_logo ? partnerLogoUrl(r.id) : null, slug: r.public_slug }))
    .sort((a, b) => a.name.localeCompare(b.name, "ro"));
}

export function partnerInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

/** Profilul public al unei agenții. */
export type PublicAgencyProfile = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
};

/** Un agent public al agenției. Telefonul e null când public_show_phone e false. */
export type PublicAgencyAgent = {
  fullName: string;
  jobTitle: string | null;
  bio: string | null;
  phone: string | null;
};

export function toPublicAgencyProfile(row: {
  id: string;
  name: string;
  description: string | null;
  has_logo: boolean;
  slug: string;
}): PublicAgencyProfile {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    logoUrl: row.has_logo ? partnerLogoUrl(row.id) : null,
  };
}

export function toPublicAgencyAgents(
  rows:
    | { full_name: string; job_title: string | null; bio: string | null; phone: string | null }[]
    | null,
): PublicAgencyAgent[] {
  return (rows ?? []).map((r) => ({
    fullName: r.full_name,
    jobTitle: r.job_title,
    bio: r.bio,
    phone: r.phone,
  }));
}
