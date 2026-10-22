/** Randarea video-ului în browser: WebCodecs + mediabunny (MP4), cu MediaRecorder ca rezervă. */
import {
  VIDEO_FORMATS, VIDEO_FPS, VIDEO_TRANSITION_SECONDS, videoSegments,
  type VideoFormat, type VideoOverlay, type VideoSegment,
} from "@/lib/property-video";
import { mixVideoAudio } from "@/lib/video-audio-mix";

const C = { navy: "#0E1118", gold: "#C8A24B", white: "#FFFFFF" };
const SERIF = '"Fraunces", Georgia, serif';
const SANS = '"Manrope", sans-serif';

export type RenderInput = {
  format: VideoFormat;
  photoUrls: string[];
  perPhoto: number;
  overlay: VideoOverlay;
  music: Blob | null;
  narration?: Blob | null;
  signal: AbortSignal;
  onProgress: (pct: number) => void;
};
export type RenderResult = { blob: Blob; ext: "mp4" | "webm"; mime: string };

export function videoGenerationSupported() {
  if (typeof document === "undefined") return false;
  const c = document.createElement("canvas");
  const hasEncoder = typeof (window as { VideoEncoder?: unknown }).VideoEncoder === "function";
  const hasRecorder = typeof MediaRecorder !== "undefined" && typeof c.captureStream === "function";
  return Boolean(c.getContext("2d")) && (hasEncoder || hasRecorder);
}

async function loadBitmap(url: string, signal: AbortSignal) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error("O poză nu a putut fi încărcată.");
  return createImageBitmap(await res.blob());
}

function cover(ctx: CanvasRenderingContext2D, img: ImageBitmap, W: number, H: number, zoom: number, dx: number, dy: number) {
  const s = Math.max(W / img.width, H / img.height) * zoom;
  const w = img.width * s, h = img.height * s;
  ctx.drawImage(img, (W - w) / 2 + dx * (w - W) / 2, (H - h) / 2 + dy * (h - H) / 2, w, h);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  const words = text.split(/\s+/); const lines: string[] = []; let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] += "…"; }
  return lines;
}

function gradient(ctx: CanvasRenderingContext2D, W: number, H: number, from: number) {
  const g = ctx.createLinearGradient(0, H * from, 0, H);
  g.addColorStop(0, "rgba(14,17,24,0)");
  g.addColorStop(1, "rgba(14,17,24,0.9)");
  ctx.fillStyle = g; ctx.fillRect(0, H * from, W, H * (1 - from));
}

function drawSegment(ctx: CanvasRenderingContext2D, seg: VideoSegment, local: number, imgs: ImageBitmap[], logo: ImageBitmap | null, o: VideoOverlay, W: number, H: number) {
  const k = Math.min(W, H) / 1080; const pad = 64 * k;
  const p = Math.min(1, Math.max(0, local / seg.duration));
  const img = imgs[seg.photo];
  if (seg.kind === "outro") {
    ctx.fillStyle = C.navy; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center"; let y = H / 2 - 160 * k;
    if (logo) {
      const lh = 160 * k, lw = Math.min(W * 0.6, (logo.width / logo.height) * lh);
      ctx.drawImage(logo, (W - lw) / 2, y - lh / 2, lw, lw * (logo.height / logo.width));
      y += 170 * k;
    }
    ctx.fillStyle = C.white;
    if (o.outro.agentName) { ctx.font = `600 ${64 * k}px ${SERIF}`; ctx.fillText(o.outro.agentName, W / 2, y); y += 80 * k; }
    if (o.outro.phone) { ctx.fillStyle = C.gold; ctx.font = `700 ${56 * k}px ${SANS}`; ctx.fillText(o.outro.phone, W / 2, y); y += 80 * k; }
    if (o.outro.reference) { ctx.fillStyle = C.white; ctx.font = `600 ${36 * k}px ${SANS}`; ctx.fillText(`Cod ofertă ${o.outro.reference}`, W / 2, y); }
    ctx.textAlign = "left"; return;
  }
  if (img) {
    const dir = seg.photo % 2 === 0 ? 1 : -1;
    const zoom = seg.kind === "intro" ? 1.05 + 0.03 * p : 1.04 + 0.08 * (dir > 0 ? p : 1 - p);
    cover(ctx, img, W, H, zoom, dir * (p - 0.5) * 0.6, (0.5 - p) * 0.3 * dir);
  } else { ctx.fillStyle = C.navy; ctx.fillRect(0, 0, W, H); }
  if (seg.kind !== "intro") return;
  gradient(ctx, W, H, 0.4);
  const lines: { text: string; font: string; color: string; gap: number }[] = [];
  ctx.font = `600 ${72 * k}px ${SERIF}`;
  for (const l of wrap(ctx, o.intro.title, W - pad * 2, 3)) lines.push({ text: l, font: ctx.font, color: C.white, gap: 84 * k });
  if (o.intro.location) lines.push({ text: o.intro.location, font: `600 ${38 * k}px ${SANS}`, color: C.white, gap: 56 * k });
  if (o.intro.price) lines.push({ text: o.intro.price, font: `600 ${64 * k}px ${SERIF}`, color: C.gold, gap: 80 * k });
  const band = o.intro.facts.length ? 96 * k : 0;
  let y = H - pad - band - lines.reduce((s, l) => s + l.gap, 0);
  for (const l of lines) { y += l.gap; ctx.font = l.font; ctx.fillStyle = l.color; ctx.fillText(l.text, pad, y - 16 * k); }
  if (band) {
    const top = H - pad - 72 * k;
    ctx.fillStyle = "rgba(14,17,24,0.75)"; ctx.fillRect(pad, top, W - pad * 2, 72 * k);
    ctx.fillStyle = C.gold; ctx.fillRect(pad, top, 6 * k, 72 * k);
    ctx.font = `700 ${32 * k}px ${SANS}`; ctx.fillStyle = C.white;
    ctx.fillText(o.intro.facts.join("  ·  "), pad + 28 * k, top + 48 * k);
  }
}

function frameAt(ctx: CanvasRenderingContext2D, t: number, segs: VideoSegment[], imgs: ImageBitmap[], logo: ImageBitmap | null, o: VideoOverlay, W: number, H: number) {
  const i = Math.max(0, segs.findIndex((s) => t < s.start + s.duration));
  const seg = segs[i] ?? segs[segs.length - 1];
  if (!seg) return;
  const local = t - seg.start;
  ctx.globalAlpha = 1;
  drawSegment(ctx, seg, local, imgs, logo, o, W, H);
  const next = segs[i + 1];
  const left = seg.duration - local;
  if (next && left < VIDEO_TRANSITION_SECONDS) {
    ctx.globalAlpha = 1 - left / VIDEO_TRANSITION_SECONDS;
    drawSegment(ctx, next, 0, imgs, logo, o, W, H);
    ctx.globalAlpha = 1;
  }
}

export async function renderPropertyVideo(input: RenderInput): Promise<RenderResult> {
  const { width: W, height: H } = VIDEO_FORMATS[input.format];
  const abort = () => { if (input.signal.aborted) throw new DOMException("Anulat", "AbortError"); };
  await document.fonts?.ready;
  const imgs: ImageBitmap[] = [];
  for (const url of input.photoUrls) { abort(); imgs.push(await loadBitmap(url, input.signal)); input.onProgress(Math.round((imgs.length / input.photoUrls.length) * 10)); }
  const logo = input.overlay.outro.logoUrl ? await loadBitmap(input.overlay.outro.logoUrl, input.signal).catch(() => null) : null;
  const segs = videoSegments(imgs.length, input.perPhoto);
  const last = segs[segs.length - 1];
  if (!last) throw new Error("Nu există fotografii pentru video.");
  const total = last.start + last.duration;
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("UNSUPPORTED");
  const mixedAudio = await mixVideoAudio(input.music, input.narration ?? null, total);
  const frames = Math.round(total * VIDEO_FPS);
  const mb = await import("mediabunny");
  const audioSupported = !mixedAudio || await mb.canEncodeAudio("aac");
  const mp4 = audioSupported && typeof (window as { VideoEncoder?: unknown }).VideoEncoder === "function" && (await mb.canEncodeVideo("avc", { width: W, height: H }));
  if (mp4) {
    const withAudio = Boolean(mixedAudio);
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
    const video = new mb.CanvasSource(canvas, { codec: "avc", bitrate: mb.QUALITY_HIGH });
    output.addVideoTrack(video, { frameRate: VIDEO_FPS });
    const audio = withAudio ? new mb.AudioBufferSource({ codec: "aac", bitrate: mb.QUALITY_MEDIUM }) : null;
    if (audio) output.addAudioTrack(audio);
    await output.start();
    try {
      for (let f = 0; f < frames; f++) {
        abort();
        frameAt(ctx, f / VIDEO_FPS, segs, imgs, logo, input.overlay, W, H);
        await video.add(f / VIDEO_FPS, 1 / VIDEO_FPS);
        if (f % 15 === 0) input.onProgress(10 + Math.round((f / frames) * 85));
      }
      if (audio && mixedAudio) await audio.add(mixedAudio);
      await output.finalize();
    } catch (e) { await output.cancel().catch(() => undefined); throw e; }
    input.onProgress(100);
    const buffer = output.target.buffer;
    if (!buffer) throw new Error("UNSUPPORTED");
    return { blob: new Blob([buffer], { type: "video/mp4" }), ext: "mp4", mime: "video/mp4" };
  }
  // Rezervă: aceeași pistă mixată, înregistrată în timp real.
  const mime = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error("UNSUPPORTED");
  const stream = canvas.captureStream(VIDEO_FPS);
  const liveAudio = mixedAudio ? new AudioContext() : null;
  let source: AudioBufferSourceNode | null = null;
  if (liveAudio && mixedAudio) {
    await liveAudio.resume();
    const destination = liveAudio.createMediaStreamDestination();
    source = liveAudio.createBufferSource(); source.buffer = mixedAudio; source.connect(destination);
    for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
  }
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => { rec.onstop = () => r(); });
  rec.start(500);
  source?.start();
  const t0 = performance.now();
  try { await new Promise<void>((resolve, reject) => {
    const tick = () => {
      if (input.signal.aborted) { rec.stop(); reject(new DOMException("Anulat", "AbortError")); return; }
      const t = (performance.now() - t0) / 1000;
      if (t >= total) { resolve(); return; }
      frameAt(ctx, t, segs, imgs, logo, input.overlay, W, H);
      input.onProgress(10 + Math.round((t / total) * 88));
      setTimeout(tick, 1000 / VIDEO_FPS);
    };
    tick();
  }); } finally {
    if (rec.state !== "inactive") rec.stop();
    await done;
    source?.stop();
    for (const track of stream.getTracks()) track.stop();
    if (liveAudio) await liveAudio.close();
  }
  const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
  input.onProgress(100);
  return { blob: new Blob(chunks, { type: mime.split(";")[0] }), ext, mime };
}
