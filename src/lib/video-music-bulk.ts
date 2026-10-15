/** Încărcare în bloc pentru biblioteca de muzică: reguli pure (nume, ID3, duplicate, lot). */
import { MUSIC_MAX_BYTES, isMp3 } from "./video-music";

export const BULK_MAX_FILES = 30;
export const BULK_CONCURRENCY = 3;

const cap = (s: string) => (s ? s.charAt(0).toLocaleUpperCase("ro-RO") + s.slice(1) : s);
const spaces = (s: string) => s.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();

/** Titlu/artist din numele fișierului. Format Pixabay: `artist-titlu-123456.mp3`. */
export function parseTrackFilename(name: string): { title: string; artist: string } {
  const base = name.replace(/\.[a-z0-9]{2,4}$/i, "").trim();
  const id = /[-_ ]+\d{3,}$/.exec(base);
  const core = id ? base.slice(0, id.index) : base;
  const spaced = /^(.+?)\s+-\s+(.+)$/.exec(core);
  if (spaced) return { artist: spaces(spaced[1]), title: cap(spaces(spaced[2])) };
  if (id && core.includes("-")) {
    const i = core.indexOf("-");
    const artist = spaces(core.slice(0, i));
    const title = spaces(core.slice(i + 1));
    if (artist && title) return { artist, title: cap(title) };
  }
  return { artist: "", title: cap(spaces(core)) };
}

function decodeText(enc: number, b: Uint8Array): string {
  let s: string;
  if (enc === 1 || enc === 2) {
    let le = enc === 1;
    let start = 0;
    if (b[0] === 0xff && b[1] === 0xfe) { le = true; start = 2; } else if (b[0] === 0xfe && b[1] === 0xff) { le = false; start = 2; }
    s = new TextDecoder(le ? "utf-16le" : "utf-16be").decode(b.subarray(start));
  } else if (enc === 3) s = new TextDecoder("utf-8").decode(b);
  else s = Array.from(b, (c) => String.fromCharCode(c)).join("");
  return s.replace(/\0+$/g, "").split("\0")[0].trim();
}

/** Citește TIT2/TPE1 (ID3v2.3/2.4, TT2/TP1 în v2.2) și, ca rezervă, ID3v1 de la final. */
export function parseId3(buf: Uint8Array): { title?: string; artist?: string } {
  const out: { title?: string; artist?: string } = {};
  if (buf.length >= 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    const ver = buf[3];
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    const end = Math.min(buf.length, 10 + size);
    let p = 10;
    if (buf[5] & 0x40 && ver >= 3) {
      const ext = ver === 4 ? ((buf[p] & 0x7f) << 21) | ((buf[p + 1] & 0x7f) << 14) | ((buf[p + 2] & 0x7f) << 7) | (buf[p + 3] & 0x7f) : ((buf[p] << 24) | (buf[p + 1] << 16) | (buf[p + 2] << 8) | buf[p + 3]) + 4;
      p += ext;
    }
    const idLen = ver === 2 ? 3 : 4;
    const hdr = ver === 2 ? 6 : 10;
    while (p + hdr <= end) {
      const id = String.fromCharCode(...buf.subarray(p, p + idLen));
      if (!/^[A-Z0-9]+$/.test(id)) break;
      const fs = ver === 2 ? (buf[p + 3] << 16) | (buf[p + 4] << 8) | buf[p + 5]
        : ver === 4 ? ((buf[p + 4] & 0x7f) << 21) | ((buf[p + 5] & 0x7f) << 14) | ((buf[p + 6] & 0x7f) << 7) | (buf[p + 7] & 0x7f)
        : ((buf[p + 4] << 24) | (buf[p + 5] << 16) | (buf[p + 6] << 8) | buf[p + 7]) >>> 0;
      const body = buf.subarray(p + hdr, p + hdr + fs);
      if (fs > 1 && (id === "TIT2" || id === "TT2")) out.title = decodeText(body[0], body.subarray(1)) || undefined;
      if (fs > 1 && (id === "TPE1" || id === "TP1")) out.artist = decodeText(body[0], body.subarray(1)) || undefined;
      if (fs <= 0) break;
      p += hdr + fs;
    }
  }
  if ((!out.title || !out.artist) && buf.length >= 128) {
    const t = buf.subarray(buf.length - 128);
    if (t[0] === 0x54 && t[1] === 0x41 && t[2] === 0x47) {
      out.title ||= decodeText(0, t.subarray(3, 33)) || undefined;
      out.artist ||= decodeText(0, t.subarray(33, 63)) || undefined;
    }
  }
  return out;
}

/** ID3 are prioritate; câmpurile lipsă se completează din numele fișierului. */
export function guessTrackMeta(name: string, id3: { title?: string; artist?: string }) {
  const f = parseTrackFilename(name);
  return { title: (id3.title?.trim() || f.title).slice(0, 120), artist: id3.artist?.trim() || f.artist };
}

export function bulkFileError(file: { name: string; type: string; size: number }): string | null {
  if (!isMp3(file)) return "Nu e MP3";
  if (file.size > MUSIC_MAX_BYTES) return "Peste 10 MB";
  return null;
}

export type ExistingTrack = { original_filename: string | null; file_size_bytes: number | null; duration_sec: number | null };

/** Același nume de fișier, sau aceeași mărime și durată (±0,5 s). */
export function isDuplicateTrack(file: { name: string; size: number; duration: number | null }, existing: ExistingTrack[]): boolean {
  const n = file.name.trim().toLowerCase();
  return existing.some((e) =>
    (e.original_filename && e.original_filename.trim().toLowerCase() === n) ||
    (e.file_size_bytes != null && e.file_size_bytes === file.size && e.duration_sec != null && file.duration != null && Math.abs(e.duration_sec - file.duration) <= 0.5));
}

export type BatchResult = { index: number; ok: boolean; error?: string };

/** Rulează lotul cu concurență limitată; o eroare nu oprește restul. */
export async function runBatch<T>(items: T[], worker: (item: T, index: number) => Promise<void>, concurrency = BULK_CONCURRENCY): Promise<BatchResult[]> {
  const results: BatchResult[] = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const i = next++;
      try { await worker(items[i], i); results[i] = { index: i, ok: true }; }
      catch (e) { results[i] = { index: i, ok: false, error: e instanceof Error ? e.message : String(e) }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
  return results;
}

export function batchSummary(uploaded: number, skipped: number, failed: number) {
  const p = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return [p(uploaded, "încărcată", "încărcate"), p(skipped, "sărită", "sărite"), p(failed, "eroare", "erori")].join(", ");
}
