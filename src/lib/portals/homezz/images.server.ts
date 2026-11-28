import { publishableImageTarget } from "@/lib/site-feed/property-media.server";
import { parseMediaId } from "@/lib/site-feed/media-redirect.server";
import { HOMEZZ_MAX_IMAGES } from "./publish";
import type { ImageParams } from "@/lib/site-feed/image-params";

type TargetArgs = Parameters<typeof publishableImageTarget>;
export const HOMEZZ_IMAGE_PARAMS: ImageParams = { width: 1024, height: 768, resize: "contain" };
export const HOMEZZ_IMAGE_TTL_SECONDS = 25 * 60 * 60;
export const HOMEZZ_IMAGE_CHECK_TIMEOUT_MS = 8_000;
type Image = TargetArgs[1] & { id: string };
type Deps = { target?: typeof publishableImageTarget; fetch?: (url: string, init: RequestInit) => Promise<Response> };

/** No redirects, no body retained, and no URL or exception containing a capability is logged. */
async function downloadable(url: string | null, transport: NonNullable<Deps["fetch"]>): Promise<boolean> {
  if (!url?.startsWith("https://") || url.includes("/api/public/sites/v1/media/")) return false;
  try {
    const response = await transport(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(HOMEZZ_IMAGE_CHECK_TIMEOUT_MS) });
    const valid = response.status === 200 && /^image\//i.test(response.headers.get("content-type") ?? "");
    await response.body?.cancel();
    return valid;
  } catch { return false; }
}

/** Resolve the already-selected gallery, retaining its order, privacy and watermark policy. */
export async function prepareHomezzImages(
  db: TargetArgs[0], urls: string[], images: Image[], property: TargetArgs[2], org: TargetArgs[3], deps: Deps = {},
): Promise<{ ids: string[]; urls: string[]; warnings: string[] }> {
  const target = deps.target ?? publishableImageTarget;
  const transport = deps.fetch ?? ((url, init) => fetch(url, init));
  const selected = urls.slice(0, HOMEZZ_MAX_IMAGES);
  const results: ({ id: string; url: string } | null)[] = [];
  // Four at a time bounds both open connections and total preparation latency.
  for (let offset = 0; offset < selected.length; offset += 4) {
    results.push(...await Promise.all(selected.slice(offset, offset + 4).map(async (url) => {
      try {
        const id = parseMediaId(new URL(url).pathname.split("/").at(-1));
        const image = images.find((i) => i.id === id);
        if (!image) return null;
        const signing = { ttlSeconds: HOMEZZ_IMAGE_TTL_SECONDS };
        const resized = await target(db, image, property, org, HOMEZZ_IMAGE_PARAMS, signing);
        if (await downloadable(resized, transport)) return resized ? { id: image.id, url: resized } : null;
        // The storage signer can already return an original on transform-signing failure.
        // Only request a second candidate when a transformed URL failed its HTTP check.
        if (!resized || new URL(resized).pathname.includes("/render/image/")) {
          const original = await target(db, image, property, org, null, signing);
          if (original !== resized && await downloadable(original, transport)) return original ? { id: image.id, url: original } : null;
        }
        return null;
      } catch { return null; }
    })));
  }
  const ready = results.filter((r): r is { id: string; url: string } => r !== null);
  const omitted = selected.length - ready.length;
  return { ids: ready.map((r) => r.id), urls: ready.map((r) => r.url), warnings: omitted ? [`HomeZZ: ${omitted} poze nu au putut fi pregătite`] : [] };
}

/** Keep useful dimensions but strip every capability/query credential from journal URLs. */
export function homezzImageLogUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const safe = new URLSearchParams();
    for (const key of ["width", "height", "resize", "quality", "w", "h", "fit"]) {
      const value = url.searchParams.get(key);
      if (value) safe.set(key, value);
    }
    url.search = safe.toString(); url.hash = ""; url.username = ""; url.password = "";
    return url.toString();
  } catch { return "[adresă omisă]"; }
}