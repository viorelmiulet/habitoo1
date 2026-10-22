import { formatFloorLabel } from "@/lib/property-floor";
import type { VideoListing } from "@/lib/property-video";

export const NARRATION_FEATURE = "ai_video_voice" as const;
export const NARRATION_MODEL = "minimax/speech-2.8-turbo";
export const NARRATION_BUCKET = "video-narration";
export const NARRATION_DAILY_LIMIT = 20;
export const NARRATION_VOICES = {
  female: { label: "Feminină", id: "Wise_Woman" },
  male: { label: "Masculină", id: "Deep_Voice_Man" },
} as const;
export type NarrationVoice = keyof typeof NARRATION_VOICES;
export function narrationWordCount(text: string) { return text.trim() ? text.trim().split(/\s+/u).length : 0; }
export function narrationWordLimit(seconds: number) { return Math.floor(Math.max(0, Math.min(60, seconds)) * 2.3); }
export function validateNarration(text: string, seconds: number): string | null {
  if (!text.trim()) return "Scrie textul narațiunii.";
  if (!Number.isFinite(seconds) || seconds < 6 || seconds > 60) return "Durata clipului trebuie să fie între 6 și 60 de secunde.";
  if (text.length > 4000 || narrationWordCount(text) > narrationWordLimit(seconds)) return `Textul depășește limita de ${narrationWordLimit(seconds)} cuvinte pentru durata clipului.`;
  if (/\b[^\s@]+@[^\s@]+\.[^\s@]+\b|(?:\+40|0040|0)[\s.-]*7(?:[\s.-]*\d){8}\b/u.test(text)) return "Narațiunea nu poate include adrese de email sau numere de telefon.";
  return null;
}
/** Deliberately accepts only public listing facts, never CRM client records. */
export function buildNarrationText(listing: VideoListing, showPrice: boolean, seconds: number): string {
  const facts = [
    listing.title.trim().split(/\s+/u).slice(0, 10).join(" "),
    [listing.district, listing.city].filter(Boolean).join(", "),
    listing.rooms ? `${listing.rooms} ${listing.rooms === 1 ? "cameră" : "camere"}` : null,
    listing.usableSurface ? `${Math.round(listing.usableSurface)} metri pătrați utili` : null,
    formatFloorLabel(listing.floor),
    showPrice && listing.price ? `Preț: ${listing.price}` : null,
  ].filter((v): v is string => Boolean(v));
  return facts.join(". ").replace(/[.!?]+$/u, "").split(/\s+/u).slice(0, narrationWordLimit(seconds)).join(" ") + ".";
}
export function buildSpeechInput(text: string, voice: NarrationVoice) {
  return { text: text.trim(), voice_id: NARRATION_VOICES[voice].id, language_boost: "Romanian", speed: 1, volume: 1, pitch: 0, audio_format: "mp3", channel: "mono" };
}
export type NarrationItem = { id: string; text: string; voice: NarrationVoice; duration_sec: number; status: "running" | "succeeded" | "failed"; error: string | null; outputUrl: string | null };