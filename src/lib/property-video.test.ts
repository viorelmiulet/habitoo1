import { describe, expect, it } from "vitest";
import { buildVideoOverlay, planVideoTimeline, videoFileName, videoSegments, type VideoListing } from "./property-video";

const listing: VideoListing = {
  title: "Apartament 3 camere Militari", district: "Militari", city: "București", price: "120.000 €",
  rooms: 3, usableSurface: 72.4, floor: "4", reference: "HB-1175", agentName: "Ana Pop", agentPhone: "0722123456",
  logoUrl: "https://example.test/logo.png",
};

describe("durate video", () => {
  it("implicit 3 s pe poză, cu intro și final de câte 3 s", () => {
    expect(planVideoTimeline(10, 3)).toEqual({ perPhoto: 3, total: 36, reduced: false });
  });
  it("limitează durata pe poză între 2 și 5 s", () => {
    expect(planVideoTimeline(2, 9).perPhoto).toBe(5);
    expect(planVideoTimeline(2, 1).perPhoto).toBe(2);
  });
  it("scade automat durata ca video-ul să nu depășească 60 s", () => {
    const p = planVideoTimeline(15, 5);
    expect(p.perPhoto).toBe(3.6);
    expect(p.total).toBeLessThanOrEqual(60);
    expect(p.reduced).toBe(true);
  });
  it("folosește maximum 15 poze", () => {
    expect(planVideoTimeline(30, 2).total).toBe(36);
    expect(videoSegments(3, 3).map((s) => s.start)).toEqual([0, 3, 6, 9, 12]);
  });
});

describe("nume fișier", () => {
  it("habitoo-<cod>-<format>.mp4", () => {
    expect(videoFileName("HB-1175", "vertical")).toBe("habitoo-HB-1175-vertical.mp4");
    expect(videoFileName(null, "square", "webm")).toBe("habitoo-anunt-square.webm");
  });
});

describe("texte pe video", () => {
  it("prețul, telefonul și logo-ul apar doar dacă sunt bifate", () => {
    const on = buildVideoOverlay(listing, { showLogo: true, showPhone: true, showPrice: true });
    expect(on.intro.price).toBe("120.000 €");
    expect(on.outro.phone).toBe("0722123456");
    expect(on.outro.logoUrl).toBe(listing.logoUrl);
    expect(on.intro.facts).toEqual(["3 camere", "72 mp utili", "Etaj 4"]);
    expect(on.outro.reference).toBe("HB-1175");
    const off = buildVideoOverlay(listing, { showLogo: false, showPhone: false, showPrice: false });
    expect([off.intro.price, off.outro.phone, off.outro.logoUrl]).toEqual([null, null, null]);
  });
  it("sursa anunțului și data adăugării nu apar niciodată", () => {
    const dirty = { ...listing, source: "imobiliare.ro", created_at: "2026-10-01", source_url: "https://x" } as VideoListing;
    const text = JSON.stringify(buildVideoOverlay(dirty, { showLogo: true, showPhone: true, showPrice: true }));
    expect(text).not.toMatch(/imobiliare\.ro|2026-10-01|source|created/i);
  });
});
