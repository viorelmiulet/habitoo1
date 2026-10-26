import { describe, expect, it, vi } from "vitest";
import { clipInputSchema } from "./generated-video-clips";
import { recordGeneratedClip, listGeneratedClips } from "./generated-video-clips.server";

const user = "00000000-0000-4000-8000-000000000001";
const org = "00000000-0000-4000-8000-000000000002";
const property = "00000000-0000-4000-8000-000000000003";
const track = "00000000-0000-4000-8000-000000000004";
const base = { id: "00000000-0000-4000-8000-000000000005", propertyId: property, fileName: "clip.mp4", format: "vertical" as const, durationSec: 60, musicKind: "track" as const, musicTrackId: track };
function fakeDb(missingProperty = false) {
  const inserted: Record<string, unknown>[] = [];
  const calls: unknown[][] = [];
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "range"]) builder[method] = (...args: unknown[]) => {
      calls.push([table, method, ...args]);
      return method === "range" ? Promise.resolve({ data: [], count: 0, error: null }) : builder;
    };
    builder.maybeSingle = async () => ({ error: null, data: table === "profiles" ? { organization_id: org } : table === "properties" ? missingProperty ? null : { id: property, title: "Apartament", reference: "HB-1" } : { title: "Piesa originală", style: "Energic", artist: "Habitoo AI", license: "Licență" } });
    builder.insert = async (row: Record<string, unknown>) => { inserted.push(row); return { error: null }; };
    return builder;
  });
  return { db: { from } as unknown as Parameters<typeof recordGeneratedClip>[0], inserted, calls };
}
describe("Istoricul tuturor clipurilor generate", () => {
  it("salvează clipul nepublicat și snapshotul muzicii în stilul ales", async () => {
    const f = fakeDb();
    await recordGeneratedClip(f.db, user, base);
    expect(f.inserted).toHaveLength(1);
    expect(f.inserted[0]).toMatchObject({ created_by: user, organization_id: org, music_track_id: track, music_title: "Piesa originală", music_style: "Energic", duration_sec: 60 });
    expect(f.calls).toContainEqual(["video_music_tracks", "eq", "active", true]);
  });
  it("nu înregistrează proprietăți inaccesibile agentului", async () => {
    const f = fakeDb(true);
    await expect(recordGeneratedClip(f.db, user, base)).rejects.toThrow("Proprietatea nu este disponibilă");
    expect(f.inserted).toHaveLength(0);
  });
  it("citește doar clipurile agentului și paginează câte 24", async () => {
    const f = fakeDb();
    await listGeneratedClips(f.db, user, 2);
    expect(f.calls).toContainEqual(["generated_video_clips", "eq", "created_by", user]);
    expect(f.calls).toContainEqual(["generated_video_clips", "range", 24, 47]);
  });
  it("înregistrează MP3 propriu fără atribuirea unei piese de bibliotecă", async () => {
    const f = fakeDb();
    await recordGeneratedClip(f.db, user, { ...base, musicKind: "own", musicTrackId: null, ownMusicName: "muzica.mp3" });
    expect(f.inserted[0]).toMatchObject({ music_kind: "own", music_track_id: null, music_title: "muzica.mp3" });
  });
  it("înregistrează și clipurile fără muzică", async () => {
    const f = fakeDb();
    await recordGeneratedClip(f.db, user, { ...base, musicKind: "none", musicTrackId: null });
    expect(f.inserted[0]).toMatchObject({ music_kind: "none", music_title: null });
  });
  it("respinge atribuirea lipsă sau contradictorie a piesei", () => {
    expect(clipInputSchema.safeParse({ ...base, musicTrackId: null }).success).toBe(false);
    expect(clipInputSchema.safeParse({ ...base, musicKind: "none" }).success).toBe(false);
  });
});