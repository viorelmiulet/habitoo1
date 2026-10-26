import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { CLIPS_PAGE_SIZE, clipInputSchema, type ClipInput } from "./generated-video-clips";

type Db = SupabaseClient<Database>;

export async function recordGeneratedClip(db: Db, userId: string, input: ClipInput) {
  const data = clipInputSchema.parse(input);
  const { data: profile, error: profileError } = await db.from("profiles").select("organization_id").eq("id", userId).maybeSingle();
  if (profileError || !profile?.organization_id) throw new Error("Agenția nu este disponibilă.");
  const { data: property, error: propertyError } = await db.from("properties").select("id,title,reference").eq("id", data.propertyId).eq("organization_id", profile.organization_id).maybeSingle();
  if (propertyError || !property) throw new Error("Proprietatea nu este disponibilă.");
  let track: { title: string; style: string; artist: string | null; license: string } | null = null;
  if (data.musicKind === "track" && data.musicTrackId) {
    const result = await db.from("video_music_tracks").select("title,style,artist,license").eq("id", data.musicTrackId).eq("active", true).maybeSingle();
    if (result.error || !result.data) throw new Error("Piesa aleasă nu este disponibilă.");
    track = result.data;
  }
  const { error } = await db.from("generated_video_clips").insert({
    id: data.id, organization_id: profile.organization_id, created_by: userId,
    property_id: property.id, property_title: property.title ?? "Proprietate", property_reference: property.reference,
    file_name: data.fileName, format: data.format, duration_sec: data.durationSec,
    music_kind: data.musicKind, music_track_id: data.musicTrackId,
    music_title: track?.title ?? (data.musicKind === "own" ? data.ownMusicName ?? null : null),
    music_style: track?.style ?? null, music_artist: track?.artist ?? null, music_license: track?.license ?? null,
  });
  // Același rezultat poate fi reîncercat fără a dubla istoricul.
  if (error && error.code !== "23505") throw new Error("Clipul nu a putut fi adăugat în istoric. Reîncearcă salvarea.");
  return { id: data.id };
}

export async function listGeneratedClips(db: Db, userId: string, page: number) {
  const offset = (page - 1) * CLIPS_PAGE_SIZE;
  const { data, count, error } = await db.from("generated_video_clips").select("*", { count: "exact" }).eq("created_by", userId).order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + CLIPS_PAGE_SIZE - 1);
  if (error) throw new Error("Clipurile nu au putut fi încărcate.");
  return { items: data ?? [], total: count ?? 0 };
}