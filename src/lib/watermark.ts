/**
 * Watermark pentru fotografiile servite CĂTRE PORTALURI.
 * Originalele din CRM rămân neatinse: varianta cu watermark se generează separat,
 * sub prefixul `watermarked/<amprenta-configurației>/`.
 */

export const WATERMARK_POSITIONS = [
  "bottom-right",
  "bottom-left",
  "top-right",
  "top-left",
  "center",
] as const;

export type WatermarkPosition = (typeof WATERMARK_POSITIONS)[number];

export const watermarkPositionLabels: Record<WatermarkPosition, string> = {
  "bottom-right": "Dreapta jos",
  "bottom-left": "Stânga jos",
  "top-right": "Dreapta sus",
  "top-left": "Stânga sus",
  center: "Centrat",
};

export type WatermarkConfig = {
  enabled: boolean;
  logoPath: string | null;
  position: WatermarkPosition;
  /** Lățimea logo-ului ca procent din lățimea fotografiei. */
  scalePercent: number;
  opacityPercent: number;
  marginPercent: number;
};

/** Tipurile de logo care pot fi rasterizate pentru watermark (fără SVG/WebP). */
export const WATERMARK_LOGO_MIME = ["image/png", "image/jpeg"] as const;

const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
};

export function logoMimeFromPath(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase();
  return ext ? (EXT_MIME[ext] ?? null) : null;
}

/** Logo-ul poate fi folosit ca watermark doar în format raster simplu. */
export function isWatermarkableLogo(path?: string | null): boolean {
  if (!path) return false;
  const mime = logoMimeFromPath(path);
  return Boolean(mime && (WATERMARK_LOGO_MIME as readonly string[]).includes(mime));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

type OrgWatermarkFields = {
  logo_path?: string | null;
  watermark_enabled?: boolean | null;
  watermark_position?: string | null;
  watermark_scale_percent?: number | null;
  watermark_opacity_percent?: number | null;
  watermark_margin_percent?: number | null;
};

export function watermarkFromOrg(org?: OrgWatermarkFields | null): WatermarkConfig {
  const position = (WATERMARK_POSITIONS as readonly string[]).includes(org?.watermark_position ?? "")
    ? (org?.watermark_position as WatermarkPosition)
    : "bottom-right";
  return {
    enabled: org?.watermark_enabled === true,
    logoPath: org?.logo_path ?? null,
    position,
    scalePercent: clamp(org?.watermark_scale_percent ?? 18, 10, 35),
    opacityPercent: clamp(org?.watermark_opacity_percent ?? 70, 20, 100),
    marginPercent: clamp(org?.watermark_margin_percent ?? 4, 0, 20),
  };
}

/** Watermark aplicabil doar dacă e activ și logo-ul e rasterizabil. */
export function isWatermarkActive(cfg: WatermarkConfig): boolean {
  return cfg.enabled && isWatermarkableLogo(cfg.logoPath);
}

/**
 * Amprenta configurației: intră în calea variantei generate, deci orice
 * schimbare de setări sau logo nou produce automat un fișier nou (cache invalidat).
 */
export function watermarkConfigHash(cfg: WatermarkConfig): string {
  const raw = [
    cfg.logoPath ?? "",
    cfg.position,
    cfg.scalePercent,
    cfg.opacityPercent,
    cfg.marginPercent,
  ].join("|");
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < raw.length; i += 1) {
    h1 = ((h1 ^ raw.charCodeAt(i)) * 0x01000193) >>> 0;
    h2 = ((h2 + raw.charCodeAt(i) * (i + 1)) * 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/** Calea variantei cu watermark; originalul nu este niciodată suprascris. */
export function watermarkedPath(storagePath: string, cfg: WatermarkConfig): string {
  return `watermarked/${watermarkConfigHash(cfg)}/${storagePath}`;
}

/** Geometria watermark-ului, în pixeli, identică pe server și în previzualizare. */
export function watermarkRect(
  imageWidth: number,
  imageHeight: number,
  logoWidth: number,
  logoHeight: number,
  cfg: WatermarkConfig,
) {
  const width = Math.max(1, Math.round((imageWidth * cfg.scalePercent) / 100));
  const height = Math.max(1, Math.round((width * logoHeight) / Math.max(1, logoWidth)));
  const margin = Math.round((imageWidth * cfg.marginPercent) / 100);

  let x = imageWidth - width - margin;
  let y = imageHeight - height - margin;
  if (cfg.position === "bottom-left" || cfg.position === "top-left") x = margin;
  if (cfg.position === "top-left" || cfg.position === "top-right") y = margin;
  if (cfg.position === "center") {
    x = Math.round((imageWidth - width) / 2);
    y = Math.round((imageHeight - height) / 2);
  }

  return {
    width,
    height,
    x: Math.max(0, Math.min(x, Math.max(0, imageWidth - width))),
    y: Math.max(0, Math.min(y, Math.max(0, imageHeight - height))),
  };
}
