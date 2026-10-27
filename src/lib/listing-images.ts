// Coada pozelor din „Anunțuri particulari” — logică pură (fără rețea/DB).
// Endpointul salvează anunțul cu URL-urile originale; worker-ul copiază pozele
// în `listing-images` și înlocuiește URL-ul pe aceeași poziție.

export const MAX_IMAGES_PER_LISTING = 12;
export const LISTING_IMAGE_TIMEOUT_MS = 8_000;
export const LISTING_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const LISTING_IMAGE_MAX_ATTEMPTS = 2;
export const LISTING_IMAGE_CONCURRENCY = 6;

const MEDIA_PATH_RE = /\/api\/public\/listings\/media\/[0-9a-f-]{36}(\?|$)/i;

/** URL stabil deja copiat în `listing-images`. */
export function isMirroredUrl(url: string): boolean {
  return MEDIA_PATH_RE.test(url);
}

/**
 * Imaginile de salvat: originalele primite, cu cele deja copiate înlocuite
 * (din joburile terminate). Dacă anunțul avea deja o galerie complet copiată
 * (vechiul import, fără joburi) cu același număr de poze, o păstrăm.
 */
export function mergeIncomingImages(
  incoming: string[],
  existingImages: string[] | null | undefined,
  doneBySource: Map<string, string>,
): string[] {
  const list = incoming.slice(0, MAX_IMAGES_PER_LISTING);
  const old = existingImages ?? [];
  const hasJobs = list.some((u) => doneBySource.has(u));
  if (!hasJobs && old.length === list.length && old.length > 0 && old.every(isMirroredUrl)) return old.slice();
  return list.map((u) => doneBySource.get(u) ?? u);
}

/** Joburile de pus în coadă: doar pozele încă necopiate, câte una per URL. */
export function planImageJobs(listingId: string, images: string[]): { listing_id: string; source_url: string; position: number }[] {
  const seen = new Set<string>();
  const jobs: { listing_id: string; source_url: string; position: number }[] = [];
  images.forEach((url, position) => {
    if (isMirroredUrl(url) || seen.has(url) || !/^https?:\/\//i.test(url)) return;
    seen.add(url);
    jobs.push({ listing_id: listingId, source_url: url, position });
  });
  return jobs;
}

/** Starea după o încercare eșuată; `attempts` include încercarea curentă. */
export function statusAfterFailure(attempts: number): "pending" | "failed" {
  return attempts < LISTING_IMAGE_MAX_ATTEMPTS ? "pending" : "failed";
}

export function imageExtension(contentType: string | null, url: string): string {
  const fromType: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
  if (contentType) {
    const base = contentType.split(";")[0]!.trim().toLowerCase();
    if (fromType[base]) return fromType[base]!;
  }
  const match = /\.(jpe?g|png|webp|gif)(?:[?#]|$)/i.exec(url);
  return match ? match[1]!.toLowerCase().replace("jpeg", "jpg") : "jpg";
}

export function safeStorageId(externalId: string): string {
  return externalId.replace(/[^a-zA-Z0-9_.-]+/g, "-").slice(0, 180) || "listing";
}
