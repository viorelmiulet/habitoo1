import type { PortalContext, PortalFail } from "../adapter";
import { imobiliareAuthedRequest, type ImobiliareSession } from "./auth.server";
import { mediasPath, IMOBILIARE_MAX_IMAGES } from "./config";
import { imobiliareMediaImages } from "./media-gallery";
import { photoWarning } from "../media-warning";

/** A media POST replaces the gallery: never split it into separate requests. */
export async function sendImobiliareGallery(
  session: ImobiliareSession,
  ctx: PortalContext,
  reference: string,
  images: { dataUrl: string; bytes: number }[],
): Promise<{ ok: true; sent: number; body: unknown; warning: string | null } | { ok: false; fail: PortalFail }> {
  if (images.length > IMOBILIARE_MAX_IMAGES) {
    return { ok: false, fail: { ok: false, code: "VALIDATION_ERROR", message: "Imobiliare.ro acceptă maximum 30 de poze într-o galerie." } };
  }
  const response = await imobiliareAuthedRequest(session, {
    method: "POST", path: mediasPath(reference), connectionKey: ctx.organizationId,
    body: { images: images.map(image => image.dataUrl) }, timeoutMs: 60_000,
  });
  // Anunțul există deja la portal: eșecul galeriei e avertisment, nu eroare; următoarea salvare o retrimite.
  if (!response.ok) {
    const reason = response.classification?.message ?? `Imobiliare.ro a răspuns HTTP ${response.status}.`;
    return { ok: true, sent: 0, body: { upload_error: { status: response.status, body: response.body } },
      warning: photoWarning(0, images.length, [`Galeria nu a fost acceptată de Imobiliare.ro: ${reason}`]) };
  }
  // Submission is not confirmation: read the gallery back, including partial acceptance.
  const verified = await imobiliareAuthedRequest(session, {
    method: "GET", path: mediasPath(reference), connectionKey: ctx.organizationId,
  });
  const confirmed = verified.ok ? imobiliareMediaImages(verified.body) : null;
  const evidence = { upload: response.body, verification: verified.body };
  if (!confirmed) {
    return { ok: true, sent: images.length, body: evidence,
      warning: `Numărul pozelor trimise nu a putut fi confirmat de Imobiliare.ro (HTTP ${verified.status}).` };
  }
  if (confirmed.length < images.length) {
    return { ok: true, sent: confirmed.length, body: evidence,
      warning: photoWarning(confirmed.length, images.length, [`Imobiliare.ro confirmă doar ${confirmed.length} fotografii după trimiterea galeriei complete.`]) };
  }
  return { ok: true, sent: confirmed.length, body: evidence, warning: null };
}