import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateGeminiNarration, narrationAudioToWav, narrationConfigured } from "./video-narration-gemini.server";

const fetchMock = vi.fn();
const pcm = new Uint8Array([1, 0, 2, 0, 3, 0, 4, 0]);
const reply = (data: string, mimeType = "audio/L16;codec=pcm;rate=24000") => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType, data } }] } }] }));
beforeEach(() => { vi.stubEnv("GEMINI_API_KEY", "test-only-key"); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Narațiune Gemini TTS", () => {
  it("PCM 24 kHz din răspuns → WAV mono 16-bit decodabil la mixaj", async () => {
    fetchMock.mockResolvedValue(reply(btoa(String.fromCharCode(...pcm))));
    const result = await generateGeminiNarration("Apartament", "female", "gemini-2.5-flash-preview-tts");
    expect(result.contentType).toBe("audio/wav"); expect(result.extension).toBe("wav");
    const v = new DataView(result.bytes.buffer);
    expect(String.fromCharCode(...result.bytes.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...result.bytes.slice(8, 12))).toBe("WAVE");
    expect(v.getUint16(22, true)).toBe(1); expect(v.getUint32(24, true)).toBe(24000); expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(pcm.length); expect([...result.bytes.slice(44)]).toEqual([...pcm]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.generationConfig.responseModalities).toEqual(["AUDIO"]);
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe("Sulafat");
  });
  it("un WAV primit rămâne neschimbat", () => { const wav = narrationAudioToWav(pcm, "audio/L16;rate=16000"); expect(narrationAudioToWav(wav, "audio/wav")).toBe(wav); expect(new DataView(wav.buffer).getUint32(24, true)).toBe(16000); });
  it("eroare HTTP → mesaj clar", async () => { fetchMock.mockResolvedValue(new Response("x", { status: 500 })); await expect(generateGeminiNarration("Apartament", "male", "gemini-2.5-flash-preview-tts")).rejects.toThrow("Generarea vocii a eșuat."); });
  it("audio lipsă sau nevalid nu se salvează", async () => { fetchMock.mockResolvedValue(reply("!!!")); await expect(generateGeminiNarration("Apartament", "male", "gemini-2.5-flash-preview-tts")).rejects.toThrow("Fișierul audio nu este valid."); });
  it("configurată doar cu GEMINI_API_KEY", () => { expect(narrationConfigured()).toBe(true); vi.stubEnv("GEMINI_API_KEY", ""); expect(narrationConfigured()).toBe(false); });
});
