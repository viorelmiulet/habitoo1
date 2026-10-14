/**
 * Video de prezentare din pozele anunțului: planificare pură (durate, nume fișier,
 * texte afișate). Randarea propriu-zisă e în `property-video-render.ts`, doar în browser.
 * Sursa anunțului și data adăugării nu fac parte din datele acceptate aici.
 */
export type VideoFormat = "vertical" | "square" | "landscape";

export const VIDEO_FORMATS: Record<VideoFormat, { width: number; height: number; label: string; help: string }> = {
  vertical: { width: 1080, height: 1920, label: "Vertical 9:16", help: "Reels, TikTok, Shorts, Story" },
  square: { width: 1080, height: 1080, label: "Pătrat 1:1", help: "Feed" },
  landscape: { width: 1920, height: 1080, label: "Orizontal 16:9", help: "YouTube, Facebook" },
};

export const VIDEO_FPS = 30;
export const VIDEO_MAX_SECONDS = 60;
export const VIDEO_MAX_PHOTOS = 15;
export const VIDEO_INTRO_SECONDS = 3;
export const VIDEO_OUTRO_SECONDS = 3;
export const VIDEO_TRANSITION_SECONDS = 0.5;
export const VIDEO_MIN_PER_PHOTO = 2;
export const VIDEO_MAX_PER_PHOTO = 5;
export const VIDEO_DEFAULT_PER_PHOTO = 3;
export const VIDEO_MAX_MUSIC_BYTES = 10 * 1024 * 1024;
export const VIDEO_MUSIC_FADE_SECONDS = 2;

export type VideoTimeline = { perPhoto: number; total: number; reduced: boolean };

/** Durata pe poză (2–5 s) scade automat ca video-ul să rămână ≤ 60 s. */
export function planVideoTimeline(photoCount: number, requestedPerPhoto: number): VideoTimeline {
  const n = Math.max(0, Math.min(VIDEO_MAX_PHOTOS, Math.floor(photoCount)));
  const asked = Math.min(VIDEO_MAX_PER_PHOTO, Math.max(VIDEO_MIN_PER_PHOTO, requestedPerPhoto || VIDEO_DEFAULT_PER_PHOTO));
  const budget = VIDEO_MAX_SECONDS - VIDEO_INTRO_SECONDS - VIDEO_OUTRO_SECONDS;
  const perPhoto = n > 0 ? Math.min(asked, Math.floor((budget / n) * 10) / 10) : asked;
  const total = Math.round((VIDEO_INTRO_SECONDS + n * perPhoto + VIDEO_OUTRO_SECONDS) * 10) / 10;
  return { perPhoto, total, reduced: perPhoto < asked };
}

export function videoFileName(reference: string | null, format: VideoFormat, ext: "mp4" | "webm" = "mp4") {
  const ref = (reference ?? "anunt").trim().replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "anunt";
  return `habitoo-${ref}-${format}.${ext}`;
}

export type VideoListing = {
  title: string;
  district: string | null;
  city: string | null;
  price: string | null;
  rooms: number | null;
  usableSurface: number | null;
  floor: string | null;
  reference: string | null;
  agentName: string | null;
  agentPhone: string | null;
  logoUrl: string | null;
};

export type VideoOverlayOptions = { showLogo: boolean; showPhone: boolean; showPrice: boolean };

export type VideoOverlay = {
  intro: { title: string; location: string | null; price: string | null; facts: string[] };
  outro: { logoUrl: string | null; agentName: string | null; phone: string | null; reference: string | null };
};

/** Textele din video. Construit doar din câmpuri permise; nimic despre sursă sau dată. */
export function buildVideoOverlay(l: VideoListing, o: VideoOverlayOptions): VideoOverlay {
  const location = [l.district, l.city].map((v) => v?.trim()).filter(Boolean).join(", ") || null;
  const facts = [
    l.rooms ? `${l.rooms} ${l.rooms === 1 ? "cameră" : "camere"}` : null,
    l.usableSurface ? `${Math.round(l.usableSurface)} mp utili` : null,
    l.floor ? `Etaj ${l.floor}` : null,
  ].filter((v): v is string => Boolean(v));
  return {
    intro: { title: l.title.trim(), location, price: o.showPrice ? l.price : null, facts },
    outro: {
      logoUrl: o.showLogo ? l.logoUrl : null,
      agentName: l.agentName,
      phone: o.showPhone ? l.agentPhone : null,
      reference: l.reference,
    },
  };
}

export type VideoSegment = { kind: "intro" | "photo" | "outro"; photo: number; start: number; duration: number };

export function videoSegments(photoCount: number, perPhoto: number): VideoSegment[] {
  const segs: VideoSegment[] = [{ kind: "intro", photo: 0, start: 0, duration: VIDEO_INTRO_SECONDS }];
  let t = VIDEO_INTRO_SECONDS;
  for (let i = 0; i < photoCount; i++) {
    segs.push({ kind: "photo", photo: i, start: t, duration: perPhoto });
    t += perPhoto;
  }
  segs.push({ kind: "outro", photo: Math.max(0, photoCount - 1), start: t, duration: VIDEO_OUTRO_SECONDS });
  return segs;
}

export function moveInList<T>(list: T[], index: number, delta: number): T[] {
  const to = index + delta;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(to, 0, item as T);
  return next;
}
