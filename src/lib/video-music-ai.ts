/**
 * Generare de muzică cu AI (fal.ai ACE-Step) pentru biblioteca video — reguli
 * pure, sigure pentru browser: limite, cost estimat, validare. Cheia și apelurile
 * de rețea stau numai pe server (`video-music-ai.server.ts`).
 */

export const MUSIC_AI_MIN_SECONDS = 15;
export const MUSIC_AI_MAX_SECONDS = 120;
export const MUSIC_AI_DEFAULT_SECONDS = 60;
/** Cost anunțat de fal.ai pentru ACE-Step: 0,0002 $ pe secundă. */
export const MUSIC_AI_COST_PER_SECOND_USD = 0.0002;
/** Limita zilnică de generări reușite (toată platforma; doar SuperAdmin generează). */
export const MUSIC_AI_DAILY_LIMIT = 30;
export const MUSIC_AI_ARTIST = "Habitoo AI";
export const MUSIC_AI_LICENSE = "Generat AI – ACE-Step (fal.ai)";

export type AiMusicInput = { title: string; style: string; durationSec: number };

/** Prima eroare în română sau null. */
export function validateAiMusicInput(i: AiMusicInput): string | null {
  if (!i.title.trim()) return "Completează titlul.";
  if (i.title.trim().length > 120) return "Titlul e prea lung (max. 120 de caractere).";
  if (!i.style.trim()) return "Descrie stilul muzicii.";
  if (i.style.trim().length > 120) return "Descrierea stilului e prea lungă (max. 120 de caractere).";
  if (!Number.isInteger(i.durationSec) || i.durationSec < MUSIC_AI_MIN_SECONDS || i.durationSec > MUSIC_AI_MAX_SECONDS) {
    return `Durata trebuie să fie între ${MUSIC_AI_MIN_SECONDS} și ${MUSIC_AI_MAX_SECONDS} de secunde.`;
  }
  return null;
}

export function estimateMusicAiCostUsd(seconds: number): number {
  return seconds * MUSIC_AI_COST_PER_SECOND_USD;
}

/** „0,012 $” — costul estimat afișat lângă butonul de generare. */
export function formatMusicAiCost(seconds: number): string {
  return `${estimateMusicAiCostUsd(seconds).toFixed(3).replace(".", ",")} $`;
}
