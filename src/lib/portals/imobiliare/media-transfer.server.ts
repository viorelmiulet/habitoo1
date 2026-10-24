import type { PortalContext, PortalFail } from "../adapter";
import { imobiliareAuthedRequest, type ImobiliareSession } from "./auth.server";
import { mediasPath, IMOBILIARE_MAX_IMAGES } from "./config";
import { imobiliareMediaImages } from "./media-gallery";

/** A media POST replaces the gallery: never split it into separate requests. */
export async function sendImobiliareGallery(
  session: ImobiliareSession,
  ctx: PortalContext,
  reference: string,
  images: { dataUrl: string; bytes: number }[],
): Promise<{ ok: true; sent: number; body: unknown } | { ok: false; fail: PortalFail }> {
  if (images.length > IMOBILIARE_MAX_IMAGES) {
    return { ok: false, fail: { ok: false, code: "VALIDATION_ERROR", message: "Imobiliare.ro acceptă maximum 30 de poze într-o galerie." } };
  }
  const response = await imobiliareAuthedRequest(session, {
    method: "POST", path: mediasPath(reference), connectionKey: ctx.organizationId,
    body: { images: images.map(image => image.dataUrl) }, timeoutMs: 60_000,
  });
  if (!response.ok) {
    return { ok: false, fail: { ok: false, code: "PORTAL_ERROR", httpStatus: response.status,
      message: `0/${images.length} poze trimise — ${response.classification?.message ?? `Imobiliare.ro a răspuns HTTP ${response.status}.`}`,
      detail: "medias", portalResponse: response.body } };
  }
  // Submission is not confirmation: read the gallery back, including partial acceptance.
  const verified = await imobiliareAuthedRequest(session, {
    method: "GET", path: mediasPath(reference), connectionKey: ctx.organizationId,
  });
  const confirmed = verified.ok ? imobiliareMediaImages(verified.body) : null;
  const evidence = { upload: response.body, verification: verified.body };
  if (!confirmed || confirmed.length !== images.length) {
    const message = confirmed
      ? `${confirmed.length}/${images.length} poze trimise — Imobiliare.ro confirmă doar ${confirmed.length} fotografii după trimiterea galeriei complete.`
      : `Numărul pozelor trimise nu a putut fi confirmat de Imobiliare.ro (HTTP ${verified.status}).`;
    return { ok: false, fail: { ok: false, code: "PORTAL_ERROR", message, detail: "medias_verification", httpStatus: verified.status, portalResponse: evidence } };
  }
  return { ok: true, sent: confirmed.length, body: evidence };
}