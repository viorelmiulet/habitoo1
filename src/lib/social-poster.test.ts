import { describe, expect, it, vi } from "vitest";
import { cleanPosterTitle, contrastRatio, formatViewing, posterFileName, SOCIAL_POSTER_SIZES, SOCIAL_POSTER_TEMPLATES, posterTemplate, posterPhotoSequence, createPosterAssetPool, renderSocialPoster, type SocialPosterOptions, type SocialPosterFormat } from "./social-poster";

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

describe("poster templates", () => {
  it("defaults to classic and keeps the chosen public photo first", () => {
    expect(posterTemplate(undefined)).toBe("classic");
    expect(posterTemplate("unknown")).toBe("classic");
    expect(posterTemplate("mosaic")).toBe("mosaic");
    expect(posterPhotoSequence(["a", "b", "c"], 1)).toEqual(["b", "c", "a"]);
    expect(posterPhotoSequence([], 0)).toEqual([]);
  });
  it("decodes each shared image only once", async () => {
    const fetcher = vi.fn(async () => ({ ok: true, blob: async () => new Blob() }));
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("createImageBitmap", async () => ({ width: 800, height: 600, close: vi.fn() }));
    const pool = createPosterAssetPool();
    await Promise.all([pool.load("photo"), pool.load("photo"), pool.load("photo")]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    pool.dispose(); vi.unstubAllGlobals();
  });
  for (const model of SOCIAL_POSTER_TEMPLATES) for (const format of Object.keys(SOCIAL_POSTER_SIZES) as SocialPosterFormat[]) {
    it(`${model.value} / ${format} renders 1 and 15 photos with long title and all options`, async () => {
      const noop = vi.fn();
      const context = new Proxy({ measureText: (t: string) => ({ width: t.length * 15 }), createLinearGradient: () => ({ addColorStop: noop }) }, { get: (target, key) => key in target ? target[key as keyof typeof target] : noop, set: () => true });
      const canvas = { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
      vi.stubGlobal("document", { fonts: { load: async () => [] } });
      vi.stubGlobal("fetch", async () => ({ ok: true, blob: async () => new Blob() }));
      vi.stubGlobal("createImageBitmap", async () => ({ width: 800, height: 600, close: noop }));
      try {
        for (const count of [1, 15]) {
          const options: SocialPosterOptions = { template: model.value, format, photoUrl: "photo0", photoUrls: Array.from({ length: count }, (_, i) => `photo${i}`), title: "Locuință extraordinară în București Ștefan cel Mare ".repeat(20), titleScale: 1.2, logoUrl: "logo", logoBackground: "white", label: "De vânzare", overtitle: "Ofertă exclusivă", location: "București", price: "125.000€", oldPrice: "135.000€", viewing: "Vizionări: 15 oct., 14:00", details: ["3 camere", "80 mp", "Etaj 2"], agent: { name: "Ana Ștefan", phone: "0722 000 111", photoUrl: "avatar" }, bigAgentPhotoUrl: "avatar", stamp: "Exclusiv", colors: { accent: "#C8A24B", background: "#0E1118", text: "#FFFFFF" } };
          await renderSocialPoster(canvas, options);
          expect(canvas.width).toBe(SOCIAL_POSTER_SIZES[format].width);
          expect(canvas.height).toBe(SOCIAL_POSTER_SIZES[format].height);
        }
      } finally { vi.unstubAllGlobals(); }
    });
  }
});
