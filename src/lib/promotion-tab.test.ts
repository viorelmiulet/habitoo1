import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { offerShareUrl, shareLinks, videoUploadStep, videoUploadCopy, VIDEO_UPLOAD_URL } from "@/lib/share";

describe("tab Promovare", () => {
  it("posterul nu mai apare în Publicare", () => {
    const src = readFileSync("src/routes/_authenticated/app.properties.$id.tsx", "utf8");
    const pub = src.slice(src.indexOf('value="publishing"'), src.indexOf('value="promotion"'));
    expect(pub).not.toContain("Creează poster");
    expect(pub).not.toContain("setSocialPosterOpen");
    expect(src).toContain("onOpenPoster={() => setSocialPosterOpen(true)}");
  });
  it("YouTube și TikTok cer video-ul înainte", () => {
    expect(videoUploadStep("youtube", null)).toBe("generate");
    expect(videoUploadStep("tiktok", null)).toBe("generate");
    expect(videoUploadStep("tiktok", { format: "square" })).toBe("generate");
    expect(videoUploadStep("tiktok", { format: "vertical" })).toBe("upload");
    expect(videoUploadStep("youtube", { format: "landscape" })).toBe("upload");
    expect(VIDEO_UPLOAD_URL).toEqual({ youtube: "https://www.youtube.com/upload", tiktok: "https://www.tiktok.com/upload" });
  });
  it("titlul și descrierea copiate conțin prețul și linkul ofertei", () => {
    const c = videoUploadCopy("Apartament 2 camere", "120.000 €", "Text", offerShareUrl("abc"));
    expect(c.title).toBe("Apartament 2 camere – 120.000 €");
    expect(c.description).toBe("Text\n\nhttps://www.habitoo.ro/oferta/abc");
  });
  it("linkurile WhatsApp și Facebook conțin /oferta/<id>", () => {
    const l = shareLinks(offerShareUrl("p-1"), "Salut");
    expect(decodeURIComponent(l.whatsapp)).toContain("/oferta/p-1");
    expect(decodeURIComponent(l.facebook)).toContain("/oferta/p-1");
  });
});
