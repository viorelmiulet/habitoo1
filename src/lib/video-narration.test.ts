import { describe, expect, it } from "vitest";
import { buildNarrationText, buildSpeechInput, narrationWordLimit, NARRATION_DAILY_LIMIT, validateNarration } from "./video-narration";
import { emptyAiFeatureMap } from "./ai/features/keys";
import { musicGainAt } from "./video-audio-mix";
import type { VideoListing } from "./property-video";

const listing: VideoListing = { title: "Apartament luminos", district: "Militari", city: "București", rooms: 2, usableSurface: 60, floor: "1", price: "120.000 euro", reference: "HB-1", agentName: "Ana Secret", agentPhone: "0722123456", logoUrl: null };
describe("narațiune video", () => {
  it("funcția nouă este oprită implicit", () => { expect(emptyAiFeatureMap().ai_video_voice).toBe(false); });
  it("limitează textul la 2,3 cuvinte/secundă", () => {
    expect(narrationWordLimit(10)).toBe(23);
    expect(validateNarration(Array(23).fill("cameră").join(" "), 10)).toBeNull();
    expect(validateNarration(Array(24).fill("cameră").join(" "), 10)).not.toBeNull();
  });
  it("nu permite mai mult de 60 s", () => { expect(validateNarration("Apartament", 61)).not.toBeNull(); });
  it("precompletează numai date publice fără date de clienți/contact", () => {
    const text = buildNarrationText({ ...listing, clientName: "Client Secret", notes: "Note confidențiale" } as VideoListing, false, 60);
    expect(text).toContain("Militari, București"); expect(text).toContain("2 camere"); expect(text).toContain("60 metri pătrați"); expect(text).toContain("Etaj 1");
    expect(text).not.toMatch(/Secret|confidențiale|0722123456|120\.000/);
  });
  it("prețul apare numai cu bifa activă", () => { expect(buildNarrationText(listing, true, 60)).toContain("120.000 euro"); expect(buildNarrationText(listing, false, 60)).not.toContain("120.000"); });
  it("respinge telefoane și emailuri în text editat", () => { expect(validateNarration("Sună 0722123456", 10)).not.toBeNull(); expect(validateNarration("Scrie ana@example.com", 10)).not.toBeNull(); });
  it("plafonul zilnic per agenție este 20", () => { expect(NARRATION_DAILY_LIMIT).toBe(20); });
  it("folosește MiniMax în română cu două voci distincte", () => { const a = buildSpeechInput("Bună", "female"), b = buildSpeechInput("Bună", "male"); expect(a.language_boost).toBe("Romanian"); expect(b.language_boost).toBe("Romanian"); expect(a.voice_id).not.toBe(b.voice_id); expect(a.audio_format).toBe("mp3"); });
});
describe("muzică sub voce", () => {
  it("reduce muzica în timpul vocii și revine după", () => { expect(musicGainAt(1, 4, 12)).toBe(0.18); expect(musicGainAt(4.175, 4, 12)).toBeCloseTo(0.59); expect(musicGainAt(5, 4, 12)).toBe(1); });
  it("fără voce păstrează muzica și fade-out 2 s", () => { expect(musicGainAt(1, 0, 12)).toBe(1); expect(musicGainAt(11, 0, 12)).toBe(0.5); expect(musicGainAt(12, 0, 12)).toBe(0); });
});