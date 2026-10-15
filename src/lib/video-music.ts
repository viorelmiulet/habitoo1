/**
 * Biblioteca de muzică pentru video: reguli pure (validare încărcare, alegerea memorată).
 * Piesele se citesc doar prin linkuri semnate scurte; scrierea e permisă doar superadminului (RLS).
 */
export const MUSIC_BUCKET = "video-music";
export const MUSIC_STYLES = ["Elegant", "Modern", "Corporate", "Calm", "Lux", "Energic"] as const;
export type MusicStyle = (typeof MUSIC_STYLES)[number];
export const MUSIC_MAX_BYTES = 10 * 1024 * 1024;
export const MUSIC_DEFAULT_LICENSE = "Pixabay Content License";
export const MUSIC_SIGNED_SECONDS = 300;
export const CERT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export type MusicTrack = {
  id: string; title: string; style: string; artist: string | null; duration_sec: number | null;
  storage_path: string; active: boolean; position: number;
};

export function isPixabayUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" && (u.hostname === "pixabay.com" || u.hostname.endsWith(".pixabay.com"));
  } catch { return false; }
}

export function isMp3(file: { name: string; type: string }) {
  return /^audio\/(mpeg|mp3)$/.test(file.type) || (!file.type && /\.mp3$/i.test(file.name)) || (/\.mp3$/i.test(file.name) && file.type === "application/octet-stream");
}

export type TrackInput = {
  title: string; style: string; sourceUrl: string; contentIdChecked: boolean;
  file?: { name: string; type: string; size: number } | null;
  certificate?: { name: string; type: string; size: number } | null;
  requireFile: boolean;
};

/** Întoarce prima eroare, în română, sau null. */
export function validateTrackInput(i: TrackInput): string | null {
  if (!i.title.trim()) return "Completează titlul.";
  if (!(MUSIC_STYLES as readonly string[]).includes(i.style)) return "Alege stilul.";
  if (!i.sourceUrl.trim()) return "Linkul Pixabay este obligatoriu.";
  if (!isPixabayUrl(i.sourceUrl)) return "Linkul trebuie să fie de pe pixabay.com.";
  if (i.requireFile && !i.file) return "Alege fișierul MP3.";
  if (i.file && !isMp3(i.file)) return "Fișierul trebuie să fie MP3.";
  if (i.file && i.file.size > MUSIC_MAX_BYTES) return "Fișierul MP3 depășește 10 MB.";
  if (i.certificate && !CERT_TYPES.includes(i.certificate.type)) return "Certificatul trebuie să fie PDF sau imagine.";
  if (!i.contentIdChecked) return "Confirmă că piesa nu are Content ID.";
  return null;
}

/** Alegerea muzicii în generator. „own” = fișierul utilizatorului (nu se memorează fișierul). */
export type MusicChoice = { kind: "none" } | { kind: "own" } | { kind: "track"; id: string };

export function parseMusicChoice(raw: string | null): MusicChoice {
  if (!raw) return { kind: "none" };
  if (raw === "own") return { kind: "own" };
  if (raw.startsWith("track:")) return { kind: "track", id: raw.slice(6) };
  return { kind: "none" };
}
export function serializeMusicChoice(c: MusicChoice) {
  return c.kind === "track" ? `track:${c.id}` : c.kind;
}
/** Piesă dezactivată/ștearsă → „Fără muzică”. „Muzica ta” revine tot la „Fără muzică” (fișierul nu se păstrează). */
export function resolveMusicChoice(saved: MusicChoice, activeIds: string[]): MusicChoice {
  if (saved.kind === "track" && activeIds.includes(saved.id)) return saved;
  return { kind: "none" };
}
export function musicChoiceKey(userId: string | null) {
  return `habitoo.videoMusic.${userId ?? "anon"}`;
}
export function formatDuration(sec: number | null | undefined) {
  if (!sec || !Number.isFinite(sec)) return "—";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
/** id-ul piesei salvat în istoric doar când e uuid. */
export function cleanTrackId(v: unknown): string | null {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null;
}
