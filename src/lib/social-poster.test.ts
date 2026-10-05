import { describe, expect, it } from "vitest";
import { cleanPosterTitle, contrastRatio, formatViewing, posterFileName, SOCIAL_POSTER_SIZES } from "./social-poster";

describe("social poster", () => {
  it("curăță separatorii și majusculele excesive", () => {
    expect(cleanPosterTitle(" | APARTAMENT MODERN DE VÂNZARE || ")).toBe("Apartament modern de vânzare");
  });

  it("creează nume PNG sigur și dimensiunile cerute", () => {
    expect(posterFileName("story", "Vilă superbă | Pipera")).toBe("poster-vila-superba-pipera-story.png");
    expect(SOCIAL_POSTER_SIZES.square).toEqual({ width: 1080, height: 1080 });
    expect(SOCIAL_POSTER_SIZES.story).toEqual({ width: 1080, height: 1920 });
    expect(SOCIAL_POSTER_SIZES.landscape).toEqual({ width: 1200, height: 628 });
    expect(SOCIAL_POSTER_SIZES.post).toEqual({ width: 1080, height: 1350 });
  });

  it("formatează vizionarea și verifică contrastul", () => {
    expect(formatViewing("2026-10-12", "14:00")).toBe("Vizionări: 12 oct., 14:00");
    expect(formatViewing(null, null)).toBeNull();
    expect(contrastRatio("#FFFFFF", "#0E1118")).toBeGreaterThan(4.5);
    expect(contrastRatio("#FFFFFF", "#F7F3EA")).toBeLessThan(4.5);
  });
});
