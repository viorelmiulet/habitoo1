/** Narațiune video prin Gemini TTS (Gemini API). Răspunsul PCM este împachetat ca WAV, decodabil la mixajul audio. */
import { buildSpeechInput, type NarrationVoice } from "./video-narration";

const FAILED = "Generarea vocii a eșuat.";
export function narrationConfigured() { return Boolean(process.env["GEMINI_API_KEY"]?.trim()); }

function decodeBase64(data: unknown): Uint8Array {
  if (typeof data !== "string" || !data.length || data.length > 30 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error("Fișierul audio nu este valid.");
  return Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
}
/** PCM 16-bit little-endian mono (implicit 24 kHz) → WAV; un WAV primit rămâne neschimbat. */
export function narrationAudioToWav(bytes: Uint8Array, mimeType: string | undefined): Uint8Array {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return bytes;
  const mime = (mimeType ?? "").toLowerCase();
  if (mime && !mime.includes("l16") && !mime.includes("pcm")) throw new Error("Fișierul audio nu este valid.");
  if (!bytes.length || bytes.length % 2) throw new Error("Fișierul audio nu este valid.");
  const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000);
  if (!Number.isInteger(rate) || rate < 8000 || rate > 96000) throw new Error("Fișierul audio nu este valid.");
  const out = new Uint8Array(44 + bytes.length);
  const view = new DataView(out.buffer);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) out[offset + i] = value.charCodeAt(i); };
  text(0, "RIFF"); view.setUint32(4, 36 + bytes.length, true); text(8, "WAVE");
  text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, bytes.length, true);
  out.set(bytes, 44);
  return out;
}

export async function generateGeminiNarration(text: string, voice: NarrationVoice, model: string) {
  const key = process.env["GEMINI_API_KEY"]?.trim();
  if (!key) throw new Error("AI nu este configurat.");
  if (!text.trim() || text.length >= 10000) throw new Error("Textul depășește limita pentru durata clipului.");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(model)) throw new Error(FAILED);
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", signal: AbortSignal.timeout(90_000),
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(buildSpeechInput(text, voice)),
    });
  } catch { throw new Error(FAILED); }
  if (!response.ok) throw new Error(FAILED);
  let payload: any;
  try { payload = await response.json(); } catch { throw new Error(FAILED); }
  const parts: any[] = payload?.candidates?.[0]?.content?.parts ?? [];
  const audio = parts.find((p) => p?.inlineData?.data)?.inlineData;
  if (!audio) throw new Error(FAILED);
  const bytes = narrationAudioToWav(decodeBase64(audio.data), audio.mimeType);
  return { bytes, contentType: "audio/wav", extension: "wav", usageCharacters: text.trim().length };
}
