import { NARRATION_MODEL, NARRATION_VOICES, type NarrationVoice } from "./video-narration";

const FAILED = "Generarea vocii a eșuat.";
export function narrationConfigured() { return Boolean(process.env["MINIMAX_API_KEY"]?.trim()); }
export function decodeNarrationHex(hex: unknown): Uint8Array {
  if (typeof hex !== "string" || !hex.length || hex.length % 2 || hex.length > 20 * 1024 * 1024 || !/^[0-9a-f]+$/i.test(hex)) throw new Error("Fișierul audio nu este valid.");
  return Uint8Array.from({ length: hex.length / 2 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16));
}
export async function generateMiniMaxNarration(text: string, voice: NarrationVoice) {
  const key = process.env["MINIMAX_API_KEY"]?.trim();
  if (!key) throw new Error("AI nu este configurat.");
  if (!text.trim() || text.length >= 10000) throw new Error("Textul depășește limita pentru durata clipului.");
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetch("https://api.minimax.io/v1/t2a_v2", {
        method: "POST", signal: AbortSignal.timeout(60_000),
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: NARRATION_MODEL, text: text.trim(), stream: false, language_boost: "Romanian", voice_setting: { voice_id: NARRATION_VOICES[voice].id, speed: 1, vol: 1, pitch: 0 }, audio_setting: { format: "mp3", sample_rate: 32000, bitrate: 128000, channel: 1 }, output_format: "hex" }),
      });
    } catch { throw new Error(FAILED); }
    if (!response.ok) throw new Error(FAILED);
    let payload: { base_resp?: { status_code?: number }; data?: { audio?: unknown }; extra_info?: { usage_characters?: unknown } };
    try { payload = await response.json(); } catch { throw new Error(FAILED); }
    const code = payload.base_resp?.status_code;
    if (code === 1002 && attempt === 0) continue;
    if (code !== 0) throw new Error(FAILED);
    const bytes = decodeNarrationHex(payload.data?.audio);
    const characters = payload.extra_info?.usage_characters;
    return { bytes, usageCharacters: typeof characters === "number" && Number.isInteger(characters) && characters >= 0 ? characters : null };
  }
  throw new Error(FAILED);
}