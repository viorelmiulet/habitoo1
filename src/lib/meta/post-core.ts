/**
 * Postare pe pagina de Facebook — părți pure, testabile (fără rețea, fără DB).
 */
import { META_GRAPH_VERSION } from "./core";
import { offerShareUrl } from "@/lib/share";

export type MetaPostKind = "photos" | "poster" | "video" | "link";
export const META_POST_MAX_PHOTOS = 10;
export const META_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const META_GRAPH_VIDEO_BASE = `https://graph-video.facebook.com/${META_GRAPH_VERSION}`;

export type MetaPostStep =
  | { endpoint: "photos"; mode: "url"; published: true }
  | { endpoint: "photos"; mode: "url"; published: false }
  | { endpoint: "photos"; mode: "source"; published: true }
  | { endpoint: "videos"; mode: "source" }
  | { endpoint: "feed"; withAttachedMedia: boolean; withLink: boolean };

/** Endpointurile apelate, în ordine, pentru tipul de postare. */
export function planMetaPost(kind: MetaPostKind, photoCount = 0): MetaPostStep[] {
  if (kind === "link") return [{ endpoint: "feed", withAttachedMedia: false, withLink: true }];
  if (kind === "poster") return [{ endpoint: "photos", mode: "source", published: true }];
  if (kind === "video") return [{ endpoint: "videos", mode: "source" }];
  if (photoCount < 1) throw new Error("Alege cel puțin o poză.");
  if (photoCount > META_POST_MAX_PHOTOS) throw new Error(`Maximum ${META_POST_MAX_PHOTOS} poze.`);
  if (photoCount === 1) return [{ endpoint: "photos", mode: "url", published: true }];
  return [
    ...Array.from({ length: photoCount }, () => ({ endpoint: "photos" as const, mode: "url" as const, published: false as const })),
    { endpoint: "feed", withAttachedMedia: true, withLink: false },
  ];
}

/** `attached_media[i]` = `{"media_fbid":"…"}` pentru `POST /{page-id}/feed`. */
export function buildAttachedMedia(ids: string[]): Record<string, string> {
  return Object.fromEntries(ids.map((id, i) => [`attached_media[${i}]`, JSON.stringify({ media_fbid: id })]));
}

/** Textul postării cu linkul ofertei adăugat la final (o singură dată). */
export function withOfferLink(text: string, propertyId: string): string {
  const link = offerShareUrl(propertyId);
  const t = text.trim();
  if (t.endsWith(link)) return t;
  return [t, link].filter(Boolean).join("\n\n");
}

export const META_RECONNECT_MESSAGE = "Reconectează pagina din Setări → Promovare";

export type MetaPostErrorKind = "expired" | "permission" | "rejected";
export class MetaPostError extends Error {
  raw?: string;
  constructor(public kind: MetaPostErrorKind, message: string, public code?: number) {
    super(message);
  }
}

/** Traduce o eroare Graph (`{ error: { code, message } }`) într-un mesaj clar. */
export function classifyMetaError(body: unknown): MetaPostError {
  const e = (body as { error?: { code?: number; message?: string; error_user_msg?: string } } | null)?.error ?? {};
  const code = typeof e.code === "number" ? e.code : undefined;
  const raw = (e.error_user_msg || e.message || "").slice(0, 500) || undefined;
  const mk = (k: MetaPostErrorKind, m: string) => Object.assign(new MetaPostError(k, m, code), { raw });
  if (code === 190) return mk("expired", `Conexiunea Facebook a expirat. ${META_RECONNECT_MESSAGE}.`);
  if (code === 10 || code === 200 || (code !== undefined && code >= 200 && code < 300)) {
    return mk("permission", "Habitoo nu are permisiunea să posteze pe această pagină. Reconectează pagina și acceptă permisiunile de postare.");
  }
  const text = (e.error_user_msg || e.message || "Facebook a respins postarea.").slice(0, 300);
  const err = new MetaPostError("rejected", `Facebook: ${text}`, code);
  err.raw = (e.error_user_msg || e.message || "").slice(0, 500) || undefined;
  return err;
}

/** Agentul postează doar pentru proprietățile lui; adminul agenției și superadminul pentru oricare. */
export function canPostForProperty(input: { role: "superadmin" | "agency_admin" | "agent" | null; userId: string; assignedTo: string | null }) {
  if (input.role === "superadmin" || input.role === "agency_admin") return true;
  return input.role === "agent" && !!input.assignedTo && input.assignedTo === input.userId;
}

export function normalizePermalink(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith("/") ? `https://www.facebook.com${url}` : url;
}
