import { describe, expect, it } from "vitest";
import jpeg from "jpeg-js";
import {
  isWatermarkActive,
  isWatermarkableLogo,
  watermarkConfigHash,
  watermarkFromOrg,
  watermarkRect,
  watermarkedPath,
  type WatermarkConfig,
} from "@/lib/watermark";
import { composeWatermark } from "@/lib/watermark.server";

const cfg: WatermarkConfig = {
  enabled: true,
  logoPath: "org/logo-1.png",
  position: "bottom-right",
  scalePercent: 20,
  opacityPercent: 100,
  marginPercent: 5,
};

describe("configurația watermark", () => {
  it("este dezactivat implicit, deci comportamentul actual rămâne neschimbat", () => {
    const derived = watermarkFromOrg({});
    expect(derived.enabled).toBe(false);
    expect(derived.position).toBe("bottom-right");
    expect(derived.scalePercent).toBe(18);
    expect(derived.opacityPercent).toBe(70);
  });

  it("limitează valorile în afara intervalelor acceptate", () => {
    const derived = watermarkFromOrg({
      watermark_scale_percent: 90,
      watermark_opacity_percent: 5,
      watermark_margin_percent: 99,
      watermark_position: "nowhere",
    });
    expect(derived.scalePercent).toBe(35);
    expect(derived.opacityPercent).toBe(20);
    expect(derived.marginPercent).toBe(20);
    expect(derived.position).toBe("bottom-right");
  });

  it("acceptă doar logo-uri raster pentru watermark", () => {
    expect(isWatermarkableLogo("o/logo.png")).toBe(true);
    expect(isWatermarkableLogo("o/logo.jpg")).toBe(true);
    expect(isWatermarkableLogo("o/logo.svg")).toBe(false);
    expect(isWatermarkableLogo("o/logo.webp")).toBe(false);
    expect(isWatermarkActive({ ...cfg, logoPath: "o/logo.svg" })).toBe(false);
  });

  it("schimbarea configurației sau a logo-ului invalidează varianta generată", () => {
    const base = watermarkedPath("org/prop/foto.jpg", cfg);
    expect(base.startsWith("watermarked/")).toBe(true);
    expect(base.endsWith("/org/prop/foto.jpg")).toBe(true);
    expect(watermarkedPath("org/prop/foto.jpg", { ...cfg, scalePercent: 30 })).not.toBe(base);
    expect(watermarkedPath("org/prop/foto.jpg", { ...cfg, logoPath: "org/logo-2.png" })).not.toBe(base);
    expect(watermarkConfigHash(cfg)).toBe(watermarkConfigHash({ ...cfg, enabled: false }));
  });
});

describe("geometria watermark-ului", () => {
  it("scalează procentual și respectă marginea", () => {
    const rect = watermarkRect(1000, 800, 200, 100, cfg);
    expect(rect.width).toBe(200);
    expect(rect.height).toBe(100);
    expect(rect.x).toBe(1000 - 200 - 50);
    expect(rect.y).toBe(800 - 100 - 50);
  });

  it("aceeași configurație dă proporții identice pe rezoluții diferite", () => {
    const small = watermarkRect(800, 600, 200, 100, cfg);
    const large = watermarkRect(2400, 1800, 200, 100, cfg);
    expect(large.width / 2400).toBeCloseTo(small.width / 800, 5);
  });

  it("centrarea ignoră marginea", () => {
    const rect = watermarkRect(1000, 800, 200, 100, { ...cfg, position: "center" });
    expect(rect.x).toBe(400);
    expect(rect.y).toBe(350);
  });

  it("stânga-sus pornește din margine", () => {
    const rect = watermarkRect(1000, 800, 200, 100, { ...cfg, position: "top-left" });
    expect(rect.x).toBe(50);
    expect(rect.y).toBe(50);
  });
});

describe("compunerea watermark-ului", () => {
  it("modifică doar zona watermark-ului, nu toată fotografia", () => {
    const width = 200;
    const height = 200;
    const photo = {
      data: new Uint8Array(width * height * 4).fill(255),
      width,
      height,
    };
    const logo = { data: new Uint8Array(20 * 20 * 4).fill(0), width: 20, height: 20 };
    for (let i = 0; i < 20 * 20; i += 1) logo.data[i * 4 + 3] = 255;

    const out = composeWatermark(photo, logo, { ...cfg, position: "bottom-right" });
    const decoded = jpeg.decode(out, { useTArray: true, formatAsRGBA: true });
    expect(decoded.width).toBe(width);
    // Colțul din stânga-sus rămâne alb, colțul cu watermark devine întunecat.
    expect(decoded.data[0]!).toBeGreaterThan(200);
    const corner = ((height - 20) * width + (width - 20)) * 4;
    expect(decoded.data[corner]!).toBeLessThan(120);
  });
});
