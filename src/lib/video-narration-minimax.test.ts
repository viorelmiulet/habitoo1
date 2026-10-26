import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeNarrationHex, generateMiniMaxNarration } from "./video-narration-minimax.server";
import { NARRATION_VOICES } from "./video-narration";

const fetchMock = vi.fn();
beforeEach(() => { vi.stubEnv("MINIMAX_API_KEY", "test-only-key"); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const reply = (code: number) => new Response(JSON.stringify({ base_resp: { status_code: code }, data: { audio: "49443301" }, extra_info: { usage_characters: 9 } }));
describe("MiniMax direct narration", () => {
  it("decodes hex into MP3 bytes and reports actual characters", async () => {
    fetchMock.mockResolvedValue(reply(0));
    const result = await generateMiniMaxNarration("Apartament", "female");
    expect([...result.bytes]).toEqual([73, 68, 51, 1]); expect(result.usageCharacters).toBe(9);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ model: "speech-2.8-turbo", text: "Apartament", stream: false, language_boost: "Romanian", voice_setting: { voice_id: "Romanian_female_2_sample1", speed: 1, vol: 1, pitch: 0 }, audio_setting: { format: "mp3", sample_rate: 32000, bitrate: 128000, channel: 1 }, output_format: "hex" });
  });
  it("retries 1002 exactly once", async () => { fetchMock.mockResolvedValueOnce(reply(1002)).mockResolvedValueOnce(reply(0)); expect((await generateMiniMaxNarration("Apartament", "male")).bytes.length).toBe(4); expect(fetchMock).toHaveBeenCalledTimes(2); });
  it("does not retry 1002 a second time", async () => { fetchMock.mockImplementation(() => Promise.resolve(reply(1002))); await expect(generateMiniMaxNarration("Apartament", "male")).rejects.toThrow("Generarea vocii a eșuat."); expect(fetchMock).toHaveBeenCalledTimes(2); });
  it.each([1004, 2013])("status %s is terminal", async (code) => { fetchMock.mockResolvedValue(reply(code)); await expect(generateMiniMaxNarration("Apartament", "male")).rejects.toThrow("Generarea vocii a eșuat."); expect(fetchMock).toHaveBeenCalledTimes(1); });
  it("rejects 10000 characters before contacting MiniMax", async () => { await expect(generateMiniMaxNarration("a".repeat(10000), "female")).rejects.toThrow("limita"); expect(fetchMock).not.toHaveBeenCalled(); });
  it("rejects malformed audio instead of saving truncated bytes", () => { for (const hex of ["", "123", "zz", null]) expect(() => decodeNarrationHex(hex)).toThrow("Fișierul audio nu este valid."); });
  it("offers all four approved Romanian voices", () => { expect(Object.values(NARRATION_VOICES).map((v) => v.id)).toEqual(["Romanian_female_2_sample1", "Romanian_male_1_sample2", "Romanian_female_1_sample4", "Romanian_male_2_sample1"]); });
});