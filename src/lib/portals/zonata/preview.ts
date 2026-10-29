import type { ZonataImage, ZonataListingBody } from "./mapper";

/** A preview never crosses the server boundary with storage capabilities. */
export function zonataPreviewBodies(bodies: ZonataListingBody[], images: ZonataImage[]) {
  const paths = new Map(images.map((image) => [image.url, image.path]));
  return bodies.map((body) => ({ ...body, images: body.images.map((url) => {
    const path = paths.get(url);
    if (path) return path.split(/[?#]/)[0];
    try { return new URL(url).pathname; } catch { return "[fotografie]"; }
  }) }));
}