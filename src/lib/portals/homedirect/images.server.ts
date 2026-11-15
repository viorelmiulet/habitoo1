import { publishableImageTarget } from "@/lib/site-feed/property-media.server";
import { parseMediaId } from "@/lib/site-feed/media-redirect.server";

type TargetArgs = Parameters<typeof publishableImageTarget>;
/** Resolve only the selected gallery; previews and every other portal retain stable URLs. */
export async function directHomedirectImages(
  db: TargetArgs[0], urls: string[], images: (TargetArgs[1] & { id: string })[],
  property: TargetArgs[2], org: TargetArgs[3],
): Promise<string[]> {
  const resolved = await Promise.all(urls.map(async (url) => {
    const id = parseMediaId(new URL(url).pathname.split("/").at(-1));
    const image = images.find((i) => i.id === id);
    return image ? publishableImageTarget(db, image, property, org) : null;
  }));
  // Never silently submit a partial gallery or fall back to the slow redirect.
  if (resolved.some((url) => !url)) throw new Error("Nu s-au putut pregăti fotografiile pentru HomeDirect. Reîncearcă publicarea.");
  return resolved.filter((url): url is string => !!url);
}