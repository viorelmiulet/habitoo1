/** Parametri opționali de redimensionare pentru linkurile publice de imagini (pur). */
export type ImageFit = "cover" | "contain";
export type ImageParams = { width?: number; height?: number; resize: ImageFit };

export const IMAGE_MIN_PX = 50;
export const IMAGE_MAX_PX = 1920;
export const IMAGE_QUALITY = 75;

function px(raw: string | null): number | undefined {
  if (raw === null || !/^\d+$/.test(raw.trim())) return undefined;
  const n = Number(raw.trim());
  return n >= IMAGE_MIN_PX && n <= IMAGE_MAX_PX ? n : undefined;
}

/** `null` = fără redimensionare (comportamentul vechi). Valorile invalide se ignoră. */
export function parseImageParams(input: URLSearchParams | string | URL): ImageParams | null {
  const sp = input instanceof URLSearchParams ? input : new URL(String(input), "https://x").searchParams;
  const width = px(sp.get("w"));
  const height = px(sp.get("h"));
  if (width === undefined && height === undefined) return null;
  const resize: ImageFit = sp.get("fit")?.trim().toLowerCase() === "cover" ? "cover" : "contain";
  return { ...(width !== undefined ? { width } : {}), ...(height !== undefined ? { height } : {}), resize };
}

/** Opțiunile pentru transformarea de imagini a stocării. */
export function storageTransform(p: ImageParams) {
  return { ...(p.width ? { width: p.width } : {}), ...(p.height ? { height: p.height } : {}), resize: p.resize, quality: IMAGE_QUALITY };
}
