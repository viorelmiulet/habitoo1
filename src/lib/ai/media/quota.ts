export type MediaQuotaKind = "marketing_image" | "photo_enhance" | "photo_video";
export type MediaMonthlyUsage = {
  used: Record<MediaQuotaKind, number>;
  limits: Record<MediaQuotaKind, number>;
  resetAt: string;
};
export const DEFAULT_MEDIA_LIMITS = { marketing_image: 50, photo_enhance: 30, photo_video: 10 };
export function mediaQuotaError(message: string): string | null {
  const match = message.match(/ai_media_limit:(marketing_image|photo_enhance|photo_video):(\d+):(.+):(\d+):(\d+)$/);
  if (!match) return null;
  const [, kind, cap, resetAt, used, pending] = match;
  const reset = new Intl.DateTimeFormat("ro-RO", { timeZone: "Europe/Bucharest", day: "numeric", month: "long" }).format(new Date(resetAt));
  const label = kind === "photo_video" ? "video" : kind === "marketing_image" ? "imagini de marketing" : "îmbunătățiri de poze";
  if (Number(pending) > 0 && Number(used) < Number(cap)) return `Locurile disponibile pentru ${label} sunt rezervate de generări în lucru. Așteaptă finalizarea lor. Limita se resetează pe ${reset}.`;
  return `Ai folosit cele ${cap} ${label} incluse luna aceasta. Limita se resetează pe ${reset}.`;
}