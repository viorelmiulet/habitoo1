import { describe, expect, it, vi } from "vitest";
import type { AIProvider, AiGenerateRequest } from "../providers/types";
import { analyzeCall, summarizeClient } from "./analysis.server";
import { withEphemeralAudio, encodeWav } from "./recording";

const provider = (generate: AIProvider["generate"]): AIProvider => ({ id: "gemini", model: "test-only", supportsTools: false, generate });
describe("ephemeral audio and read-only analysis", () => {
  it("audio-ul este eliminat din cerere după transcriere și rămâne doar transcriptul", async () => {
    const audio = { mimeType: "audio/wav", base64: "UklGRg==" }; let request: AiGenerateRequest | null = null;
    const p = provider(async input => { request = input; return { text: JSON.stringify({ transcript: "Clientul caută 3 camere.", activity: "Clientul caută 3 camere.", followup: null, request: { rooms_min: 3 } }), inputTokens: 10, outputTokens: 4, toolCalls: [] }; });
    const result = await analyzeCall(p, audio);
    expect(result.proposal?.transcript).toBe("Clientul caută 3 camere."); expect(audio.base64).toBe("");
    expect((request as AiGenerateRequest | null)?.messages[0]).toMatchObject({ attachments: [] });
    expect(result.proposal).not.toHaveProperty("audio");
  });
  it("audio-ul este eliminat și când furnizorul eșuează", async () => {
    const audio = { mimeType: "audio/wav", base64: "secret-audio" };
    await expect(analyzeCall(provider(async () => { throw new Error("simulated"); }), audio)).rejects.toThrow("simulated"); expect(audio.base64).toBe("");
  });
  it("bytes și base64 locale se curăță după expediere, fără storage", async () => {
    const bytes = new Uint8Array([82, 73, 70, 70]); const audio = { arrayBuffer: async () => bytes.buffer } as Blob;
    let sent: { base64: string; mimeType: string } | null = null;
    const result = await withEphemeralAudio(audio, async value => { sent = value; expect(value.base64).toBe("UklGRg=="); return "transcript"; });
    expect(result).toBe("transcript"); expect(bytes).toEqual(new Uint8Array(4)); expect((sent as { base64: string } | null)?.base64).toBe("");
  });
  it("fișierul înregistrat are antet WAV complet", async () => {
    const audio = encodeWav([new Float32Array([0.2, -0.2])], 16000); const bytes = new Uint8Array(await audio.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF"); expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe("WAVE"); expect(bytes.length).toBe(48);
  });
  it("generarea rezumatului nu cere tool-uri, date externe sau scrieri", async () => {
    const history = [{ id: "n1", label: "Nota", text: "A respins oferta din cauza zgomotului." }];
    const generate = vi.fn<AIProvider["generate"]>().mockResolvedValue({ text: JSON.stringify({ facts: [{ id: "n1", excerpt: history[0]?.text }], next: "clarify" }), toolCalls: [], inputTokens: 3, outputTokens: 4 });
    const result = await summarizeClient(provider(generate), history);
    expect(result.summary).toContain("din cauza zgomotului"); expect(generate.mock.calls[0]?.[0].tools).toEqual([]); expect(generate.mock.calls[0]?.[0].messages).toEqual([{ role: "user", content: JSON.stringify(history) }]);
  });
});