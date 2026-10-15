/**
 * Postare pe Instagram (Content Publishing) — părți pure, testabile.
 */
import { MetaPostError, META_RECONNECT_MESSAGE } from "./post-core";

export type IgPostKind = "ig_poster" | "ig_album" | "ig_photo" | "ig_reel" | "ig_story";
export type IgRatio = "1:1" | "4:5";
export const IG_ALBUM_MIN = 2;
export const IG_ALBUM_MAX = 10;
export const IG_CAPTION_MAX = 2200;
export const IG_HASHTAGS_MAX = 30;
export const IG_MAX_EDGE = 1440;
export const IG_JPEG_QUALITY = 0.9;
export const IG_POLL_INTERVAL_MS = 5000;
export const IG_POLL_MAX_MS = 5 * 60 * 1000;
export const IG_TEMP_URL_TTL = 3600;
export const IG_TEMP_FILE_TTL_HOURS = 24;

export type IgStep =
  | { op: "container"; params: Record<string, string> }
  | { op: "carousel_item"; image: number }
  | { op: "carousel"; caption: string }
  | { op: "wait" }
  | { op: "publish" };

export type IgMedia = { images: string[]; videoUrl?: string | null };

/** Pașii Graph pentru tipul ales. Imaginile sunt URL-uri semnate (JPEG). */
export function planInstagramPost(kind: IgPostKind, media: IgMedia, caption: string): IgStep[] {
  if (kind === "ig_album") {
    const n = media.images.length;
    if (n < IG_ALBUM_MIN) throw new Error(`Albumul are nevoie de cel puțin ${IG_ALBUM_MIN} poze.`);
    if (n > IG_ALBUM_MAX) throw new Error(`Maximum ${IG_ALBUM_MAX} poze într-un album.`);
    return [...media.images.map((_, i) => ({ op: "carousel_item" as const, image: i })), { op: "carousel", caption }, { op: "publish" }];
  }
  if (kind === "ig_reel") {
    if (!media.videoUrl) throw new Error("Creează întâi video-ul vertical.");
    return [
      { op: "container", params: { media_type: "REELS", video_url: media.videoUrl, caption, share_to_feed: "true" } },
      { op: "wait" },
      { op: "publish" },
    ];
  }
  if (kind === "ig_story") {
    if (media.videoUrl) {
      return [{ op: "container", params: { media_type: "STORIES", video_url: media.videoUrl } }, { op: "wait" }, { op: "publish" }];
    }
    if (!media.images[0]) throw new Error("Lipsește posterul pentru story.");
    return [{ op: "container", params: { media_type: "STORIES", image_url: media.images[0] } }, { op: "publish" }];
  }
  if (!media.images[0]) throw new Error(kind === "ig_poster" ? "Creează întâi posterul." : "Alege o poză.");
  return [{ op: "container", params: { image_url: media.images[0], caption } }, { op: "publish" }];
}

const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;

export function countHashtags(text: string): number {
  return (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
}

/** Descrierea pentru Instagram: fără linkuri (nu sunt clicabile), cu „Detalii: <telefon>” la final. */
export function buildInstagramCaption(text: string, phone: string | null | undefined): string {
  const body = text.replace(URL_RE, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const tail = phone?.trim() ? `Detalii: ${phone.trim()}` : "";
  if (tail && body.endsWith(tail)) return body;
  return [body, tail].filter(Boolean).join("\n\n");
}

export function validateInstagramCaption(caption: string): string | null {
  if (caption.length > IG_CAPTION_MAX) return `Descrierea are ${caption.length} caractere; maximum ${IG_CAPTION_MAX}.`;
  const tags = countHashtags(caption);
  if (tags > IG_HASHTAGS_MAX) return `Descrierea are ${tags} hashtaguri; maximum ${IG_HASHTAGS_MAX}.`;
  return null;
}

/** Decupare centrată la raport + dimensiunea finală (latura lungă ≤ 1440 px). */
export function cropRect(width: number, height: number, ratio: IgRatio) {
  const target = ratio === "1:1" ? 1 : 4 / 5;
  let sw = width;
  let sh = height;
  if (width / height > target) sw = Math.round(height * target);
  else sh = Math.round(width / target);
  const sx = Math.round((width - sw) / 2);
  const sy = Math.round((height - sh) / 2);
  const scale = Math.min(1, IG_MAX_EDGE / Math.max(sw, sh));
  return { sx, sy, sw, sh, outW: Math.round(sw * scale), outH: Math.round(sh * scale) };
}

/** Instagram acceptă în feed raport între 4:5 și 1,91:1. */
export function isFeedRatioOk(width: number, height: number) {
  const r = width / height;
  return r >= 0.8 - 0.005 && r <= 1.91 + 0.005;
}

export type IgErrorKind = "expired" | "permission" | "format" | "video" | "limit" | "rejected";
export class IgPostError extends MetaPostError {
  constructor(public igKind: IgErrorKind, message: string, code?: number, public override raw?: string) {
    super(igKind === "expired" ? "expired" : igKind === "permission" ? "permission" : "rejected", message, code);
  }
}

export function classifyInstagramError(body: unknown): IgPostError {
  const e = (body as { error?: { code?: number; error_subcode?: number; message?: string; error_user_msg?: string; error_user_title?: string } } | null)?.error ?? {};
  const code = typeof e.code === "number" ? e.code : undefined;
  const sub = typeof e.error_subcode === "number" ? e.error_subcode : undefined;
  const raw = (e.error_user_msg || e.message || "").slice(0, 500);
  const meta = raw ? ` (${raw.slice(0, 200)})` : "";
  if (code === 190) return new IgPostError("expired", `Conexiunea Instagram a expirat. ${META_RECONNECT_MESSAGE}.`, code, raw);
  if (sub === 2207042 || code === 4 || code === 9 || code === 32 || code === 613) {
    return new IgPostError("limit", `Instagram permite maximum 100 de postări în 24 de ore pentru acest cont. Încearcă mai târziu.${meta}`, code, raw);
  }
  if (sub === 2207009 || sub === 2207004 || sub === 2207005 || code === 36003 || code === 36004) {
    return new IgPostError("format", `Instagram nu acceptă formatul sau raportul imaginii (doar JPEG, între 4:5 și 1,91:1).${meta}`, code, raw);
  }
  if (sub === 2207026 || sub === 2207052 || sub === 2207053 || code === 352) {
    return new IgPostError("video", `Instagram nu acceptă acest video.${meta}`, code, raw);
  }
  if (code === 10 || (code !== undefined && code >= 200 && code < 300)) {
    return new IgPostError("permission", "Habitoo nu are permisiunea să posteze pe acest cont de Instagram. Reconectează din Setări → Promovare.", code, raw);
  }
  return new IgPostError("rejected", `Instagram: ${raw || "postarea a fost respinsă."}`, code, raw);
}

export const IG_NO_ACCOUNT_MESSAGE = "Leagă contul de Instagram Business de pagina de Facebook, apoi reconectează din Setări → Promovare";
