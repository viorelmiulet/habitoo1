import { z } from "zod";

export const clipInputSchema = z.object({
  id: z.string().uuid(),
  propertyId: z.string().uuid(),
  fileName: z.string().min(1).max(200),
  format: z.enum(["vertical", "square", "landscape"]),
  durationSec: z.number().positive().max(60),
  musicKind: z.enum(["none", "own", "track"]),
  musicTrackId: z.string().uuid().nullable(),
  ownMusicName: z.string().max(200).optional(),
}).refine((v) => v.musicKind === "track" ? v.musicTrackId !== null : v.musicTrackId === null, "Muzica aleasă nu este validă.");
export type ClipInput = z.infer<typeof clipInputSchema>;
export const CLIPS_PAGE_SIZE = 24;

export function clipMusicLabel(clip: { music_kind: string; music_title: string | null }) {
  if (clip.music_kind === "none") return "Fără muzică";
  if (clip.music_kind === "own") return clip.music_title ? `MP3 propriu · ${clip.music_title}` : "MP3 propriu";
  return clip.music_title ?? "Piesă din bibliotecă";
}