// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { assertImagesLoaded, imageToDataUrl, scaledSize, IMAGE_LOAD_ERROR } from "./property-sheet-pdf";
import { galleryPageCount } from "./property-sheet-templates";
import { buildPresentationHtml, brandingFromOrg } from "./materials";

describe("imagini fișă PDF", () => {
  it("convertește în data URL redimensionat la max 1600 px", async () => {
    let seenMax = 0;
    const url = await imageToDataUrl("https://x/a.jpg", {
      fetchImpl: (async () => new Response(new Blob(["x"], { type: "image/jpeg" }))) as typeof fetch,
      rasterize: async (_b, max) => { seenMax = max; return "data:image/jpeg;base64,AAA"; },
    });
    expect(url).toBe("data:image/jpeg;base64,AAA");
    expect(seenMax).toBe(1600);
    expect(scaledSize(1440, 1920)).toEqual({ width: 1200, height: 1600 });
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it("oprește generarea când o imagine lipsește", async () => {
    await expect(imageToDataUrl("https://x/a.jpg", { fetchImpl: (async () => new Response("", { status: 404 })) as typeof fetch }))
      .rejects.toThrow(IMAGE_LOAD_ERROR);
    const root = document.createElement("div");
    const img = document.createElement("img");
    Object.defineProperty(img, "complete", { value: true });
    Object.defineProperty(img, "naturalWidth", { value: 0 });
    root.append(img);
    expect(() => assertImagesLoaded(root)).toThrow(IMAGE_LOAD_ERROR);
    Object.defineProperty(img, "naturalWidth", { value: 100 });
    expect(() => assertImagesLoaded(root)).not.toThrow();
  });
});

describe("pagini Galerie", () => {
  it("10 → 2, 17 → 2, 18 → 3 (fără poza principală)", () => {
    expect(galleryPageCount(10)).toBe(2);
    expect(galleryPageCount(17)).toBe(2);
    expect(galleryPageCount(18)).toBe(3);
  });
  const data = (n: number, allPhotos?: boolean) => ({
    title: "T", location: "L", price: "1 EUR", specs: [], description: "Descriere", audience: "agent" as const,
    photos: Array.from({ length: n }, (_, i) => `https://x/${i}.jpg`), allPhotos,
    agent: { name: "A", phone: "0700", email: "a@a", photoUrl: null },
  });
  const b = brandingFromOrg(null);
  it("cu opțiunea debifată HTML-ul e identic", () => {
    for (const t of ["classic", "elegant", "panoramic", "split", "gallery", "minimal"] as const) {
      expect(buildPresentationHtml(b, { ...data(10, false), template: t } as never))
        .toBe(buildPresentationHtml(b, { ...data(10), template: t } as never));
    }
  });
  it("bifat: toate pozele pe pagini Galerie, la toate șabloanele", () => {
    for (const t of ["classic", "elegant", "panoramic", "split", "gallery", "minimal"] as const) {
      const html = buildPresentationHtml(b, { ...data(18, true), template: t } as never);
      expect(html.match(/class="page photo-page"/g)?.length).toBe(3);
      expect(html.match(/<div class="photo-grid">[\s\S]*?<\/div>/g)!.join("")).not.toContain("https://x/0.jpg");
    }
  });
});
