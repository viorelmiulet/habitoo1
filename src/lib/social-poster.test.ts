import { describe, expect, it } from "vitest";
import { cleanPosterTitle, posterFileName, SOCIAL_POSTER_SIZES } from "./social-poster";

describe("social poster", () => {
  it("curăță separatorii și majusculele excesive", () => {
    expect(cleanPosterTitle(" | APARTAMENT MODERN DE VÂNZARE || ")).toBe("Apartament modern de vânzare");
  });

  it("creează nume PNG sigur și dimensiunile cerute", () => {
    expect(posterFileName("story", "Vilă superbă | Pipera")).toBe("story-vila-superba-pipera.png");
    expect(SOCIAL_POSTER_SIZES.story).toEqual({ width: 1080, height: 1920 });
    expect(SOCIAL_POSTER_SIZES.post).toEqual({ width: 1080, height: 1350 });
  });
});