// Logo-ul agenției trimis către portaluri: fișierul încărcat (`logo_path`, bucket privat
// `agency-logos`, livrat prin URL semnat ca în restul aplicației), cu `logo_url` doar ca rezervă.

export const AGENCY_LOGO_BUCKET = "agency-logos";
/** URL-ul semnat trebuie să reziste între două citiri ale feedului de către portal. */
export const AGENCY_LOGO_PORTAL_TTL_SECONDS = 365 * 24 * 3600;

function httpsOnly(url: string | null | undefined): string | null {
  const v = url?.trim();
  if (!v) return null;
  try {
    return new URL(v).protocol === "https:" ? v : null;
  } catch {
    return null;
  }
}

export function pickAgencyLogoUrl(
  org: { logo_path?: string | null; logo_url?: string | null },
  signedByPath: Map<string, string>,
): string | null {
  const signed = org.logo_path ? httpsOnly(signedByPath.get(org.logo_path)) : null;
  return signed ?? httpsOnly(org.logo_url);
}

type StorageLike = {
  storage: {
    from: (bucket: string) => {
      createSignedUrls: (
        paths: string[],
        expiresIn: number,
      ) => PromiseLike<{
        data: { path: string | null; signedUrl: string | null; error?: string | null }[] | null;
        error: unknown;
      }>;
    };
  };
};

/** Semnează dintr-o singură cerere toate logo-urile; eșecul lasă doar rezerva `logo_url`. */
export async function signAgencyLogos(db: StorageLike, paths: (string | null | undefined)[]) {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data, error } = await db.storage
    .from(AGENCY_LOGO_BUCKET)
    .createSignedUrls(unique, AGENCY_LOGO_PORTAL_TTL_SECONDS);
  if (error || !data) return map;
  for (const row of data) if (row.path && row.signedUrl) map.set(row.path, row.signedUrl);
  return map;
}
