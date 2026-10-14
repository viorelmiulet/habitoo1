import { describe, expect, it } from "vitest";
import { canShareFiles, offerOgMeta, offerShareUrl, shareLinks } from "./share";

const ID = "f0611cec-8aa7-4577-92a2-fdd50d347e0c";

describe("linkuri de distribuire", () => {
  it("codează corect Facebook, WhatsApp și LinkedIn", () => {
    const link = offerShareUrl(ID);
    expect(link).toBe(`https://www.habitoo.ro/oferta/${ID}`);
    const l = shareLinks(link, "Apartament 3 camere & terasă – 120.000 €");
    expect(l.facebook).toBe(`https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fwww.habitoo.ro%2Foferta%2F${ID}`);
    expect(l.linkedin).toBe(`https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fwww.habitoo.ro%2Foferta%2F${ID}`);
    expect(l.whatsapp.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(l.whatsapp.slice("https://wa.me/?text=".length))).toBe(`Apartament 3 camere & terasă – 120.000 €\n\n${link}`);
    expect(l.whatsapp).not.toMatch(/[ &€]/);
  });
});

describe("butoanele de telefon", () => {
  const file = [new File(["x"], "a.jpg", { type: "image/jpeg" })];
  it("apar doar când canShare acceptă fișiere", () => {
    expect(canShareFiles({ canShare: () => true, share: async () => {} }, file)).toBe(true);
    expect(canShareFiles({ canShare: (d) => !d?.files, share: async () => {} }, file)).toBe(false);
    expect(canShareFiles({ share: async () => {} }, file)).toBe(false);
    expect(canShareFiles(undefined, file)).toBe(false);
  });
});

describe("previzualizarea /oferta/<id>", () => {
  const base = { id: ID, title: "Apartament", price: 120000, currency: "EUR", transactionKind: "sale", rooms: 3, usableSurface: 72, district: "Militari", city: "București", agencyName: "MRM IMOBILIARE" };
  it("og:image este prima poză a anunțului, cu .jpg și dimensiuni", () => {
    const og = offerOgMeta({ ...base, images: [{ id: "11111111-1111-1111-1111-111111111111", width: 1600, height: 1200 }] });
    expect(og.image).toBe("https://www.habitoo.ro/api/public/sites/v1/media/11111111-1111-1111-1111-111111111111.jpg");
    expect([og.width, og.height]).toEqual([1600, 1200]);
    expect(og.siteName).toBe("MRM IMOBILIARE");
    expect(og.description).toMatch(/3 camere · 72 mp utili · Militari, București$/);
  });
  it("fără poze folosește coperta generică", () => {
    expect(offerOgMeta({ ...base, images: [] }).image).toBe("https://www.habitoo.ro/assets/og-cover.jpg");
  });
});
