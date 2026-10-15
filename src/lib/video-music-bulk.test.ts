import { describe, expect, it } from "vitest";
import { batchSummary, bulkFileError, guessTrackMeta, isDuplicateTrack, parseId3, parseTrackFilename, runBatch } from "./video-music-bulk";

function id3v23(frames: Record<string, string>) {
  const parts: number[] = [];
  for (const [id, text] of Object.entries(frames)) {
    const body = [3, ...new TextEncoder().encode(text)];
    const s = body.length;
    parts.push(...[...id].map((c) => c.charCodeAt(0)), (s >>> 24) & 255, (s >>> 16) & 255, (s >>> 8) & 255, s & 255, 0, 0, ...body);
  }
  const n = parts.length;
  return new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, (n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127, ...parts, 0xff, 0xfb]);
}

describe("nume de fișier", () => {
  it("Pixabay artist-titlu-id", () => {
    expect(parseTrackFilename("lexin_music-cinematic-epic-emotional-123456.mp3")).toEqual({ artist: "lexin music", title: "Cinematic epic emotional" });
    expect(parseTrackFilename("alexgrohl-corporate_upbeat-98765.mp3")).toEqual({ artist: "alexgrohl", title: "Corporate upbeat" });
  });
  it("nume obișnuite", () => {
    expect(parseTrackFilename("piano_calm.mp3")).toEqual({ artist: "", title: "Piano calm" });
    expect(parseTrackFilename("soft-piano-melody.MP3")).toEqual({ artist: "", title: "Soft piano melody" });
    expect(parseTrackFilename("Ana Pop - Seară liniștită.mp3")).toEqual({ artist: "Ana Pop", title: "Seară liniștită" });
    expect(parseTrackFilename("ambient-2024.mp3")).toEqual({ artist: "", title: "Ambient" });
  });
});

describe("ID3", () => {
  it("TIT2/TPE1 au prioritate față de nume", () => {
    const tags = parseId3(id3v23({ TIT2: "Lumină de seară", TPE1: "Ștefan" }));
    expect(tags).toEqual({ title: "Lumină de seară", artist: "Ștefan" });
    expect(guessTrackMeta("x-y-123456.mp3", tags)).toEqual({ title: "Lumină de seară", artist: "Ștefan" });
  });
  it("ID3v1 și completare din nume", () => {
    const b = new Uint8Array(200); b.set([0x54, 0x41, 0x47], 72); b.set(new TextEncoder().encode("Old Title"), 75);
    expect(parseId3(b).title).toBe("Old Title");
    expect(guessTrackMeta("artistul-piesa-123456.mp3", { title: "Piesa ID3" })).toEqual({ title: "Piesa ID3", artist: "artistul" });
    expect(guessTrackMeta("artistul-piesa-123456.mp3", parseId3(new Uint8Array([1, 2, 3])))).toEqual({ title: "Piesa", artist: "artistul" });
  });
});

describe("fișiere respinse", () => {
  it("non-MP3 și peste 10 MB", () => {
    expect(bulkFileError({ name: "a.wav", type: "audio/wav", size: 10 })).toBe("Nu e MP3");
    expect(bulkFileError({ name: "a.mp3", type: "audio/mpeg", size: 10 * 1024 * 1024 + 1 })).toBe("Peste 10 MB");
    expect(bulkFileError({ name: "a.mp3", type: "audio/mpeg", size: 10 * 1024 * 1024 })).toBeNull();
  });
});

describe("duplicate", () => {
  const existing = [{ original_filename: "Piano-123.mp3", file_size_bytes: 5000, duration_sec: 120 }, { original_filename: null, file_size_bytes: 7000, duration_sec: 90.2 }];
  it("același nume de fișier", () => expect(isDuplicateTrack({ name: "piano-123.mp3", size: 1, duration: 1 }, existing)).toBe(true));
  it("aceeași mărime și durată", () => expect(isDuplicateTrack({ name: "alt.mp3", size: 7000, duration: 90 }, existing)).toBe(true));
  it("mărime egală, durată diferită → nou", () => expect(isDuplicateTrack({ name: "alt.mp3", size: 7000, duration: 60 }, existing)).toBe(false));
});

describe("lot", () => {
  it("continuă după o eroare și păstrează ordinea", async () => {
    const done: number[] = [];
    const r = await runBatch([1, 2, 3, 4, 5], async (n) => { if (n === 2) throw new Error("rețea"); done.push(n); }, 3);
    expect(r.map((x) => x.ok)).toEqual([true, false, true, true, true]);
    expect(r[1].error).toBe("rețea");
    expect(done.sort()).toEqual([1, 3, 4, 5]);
  });
  it("max 3 în paralel", async () => {
    let live = 0, peak = 0;
    await runBatch(Array.from({ length: 8 }), async () => { live++; peak = Math.max(peak, live); await new Promise((s) => setTimeout(s, 5)); live--; });
    expect(peak).toBe(3);
  });
  it("rezumat", () => expect(batchSummary(8, 1, 1)).toBe("8 încărcate, 1 sărită, 1 eroare"));
});
