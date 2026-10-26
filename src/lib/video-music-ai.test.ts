import { describe, expect, it } from "vitest";
import {
  MUSIC_AI_DAILY_LIMIT,
  MUSIC_AI_DEFAULT_SECONDS,
  MUSIC_AI_MAX_SECONDS,
  MUSIC_AI_MIN_SECONDS,
  estimateMusicAiCostUsd,
  formatMusicAiCost,
  validateAiMusicInput,
} from "./video-music-ai";

describe("validateAiMusicInput", () => {
  const ok = { title: "Pian calm", style: "pian calm, modern", durationSec: 60 };
  it("acceptă o cerere validă", () => {
    expect(validateAiMusicInput(ok)).toBeNull();
  });
  it("cere titlul și stilul", () => {
    expect(validateAiMusicInput({ ...ok, title: " " })).toMatch(/titlul/i);
    expect(validateAiMusicInput({ ...ok, style: "" })).toMatch(/stilul/i);
  });
  it("limitează durata la 15–120 de secunde", () => {
    expect(validateAiMusicInput({ ...ok, durationSec: MUSIC_AI_MIN_SECONDS })).toBeNull();
    expect(validateAiMusicInput({ ...ok, durationSec: MUSIC_AI_MAX_SECONDS })).toBeNull();
    expect(validateAiMusicInput({ ...ok, durationSec: 14 })).toMatch(/15 și 120/);
    expect(validateAiMusicInput({ ...ok, durationSec: 121 })).toMatch(/15 și 120/);
    expect(validateAiMusicInput({ ...ok, durationSec: 60.5 })).toMatch(/15 și 120/);
  });
  it("respinge titluri și stiluri prea lungi", () => {
    expect(validateAiMusicInput({ ...ok, title: "x".repeat(121) })).toMatch(/120/);
    expect(validateAiMusicInput({ ...ok, style: "x".repeat(121) })).toMatch(/120/);
  });
});

describe("cost estimat", () => {
  it("0,0002 $ pe secundă", () => {
    expect(estimateMusicAiCostUsd(60)).toBeCloseTo(0.012, 5);
    expect(estimateMusicAiCostUsd(15)).toBeCloseTo(0.003, 5);
  });
  it("formatează cu virgulă", () => {
    expect(formatMusicAiCost(MUSIC_AI_DEFAULT_SECONDS)).toBe("0,012 $");
  });
  it("limita zilnică este 30", () => {
    expect(MUSIC_AI_DAILY_LIMIT).toBe(30);
  });
});
