// Reguli pentru importul hbsync: prefixul de perioadă și oglindirea imaginilor.
import { describe, expect, it } from "vitest";
import { periodPrefix, mirrorListingImages, LISTING_IMAGES_BUCKET } from "@/routes/api/public/listings/upsert";

describe("periodPrefix", () => {
  it("mapează „luna” pe textul de închiriere lunară", () => {
    expect(periodPrefix("luna")).toBe("(închiriere - preț pe lună)");
    expect(periodPrefix("Lună")).toBe("(închiriere - preț pe lună)");
  });

  it("mapează „zi” pe textul de închiriere zilnică", () => {
    expect(periodPrefix("zi")).toBe("(închiriere - preț pe zi)");
  });

  it("păstrează alte valori ca atare, între paranteze", () => {
    expect(periodPrefix("saptamana")).toBe("(saptamana)");
  });
});

describe("mirrorListingImages", () => {
  const uploads: { bucket: string; path: string }[] = [];
  const fakeStorage = {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string) => {
          uploads.push({ bucket, path });
          return { error: null };
        },
      }),
    },
  };

  it("limitează la 12 imagini și folosește bucketul privat", async () => {
    uploads.length = 0;
    const urls = Array.from({ length: 15 }, (_, i) => `https://cdn.example.com/img-${i}.jpg`);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    try {
      const stored = await mirrorListingImages(fakeStorage, "ext-1", urls, "https://crm.test");
      expect(stored).toHaveLength(12);
      expect(uploads).toHaveLength(12);
      expect(uploads.every((u) => u.bucket === LISTING_IMAGES_BUCKET)).toBe(true);
      expect(uploads.every((u) => u.path.startsWith("ext-1/"))).toBe(true);
      expect(stored.every((u) => u.startsWith("https://crm.test/api/public/listings/media/"))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("sare peste imaginile care pică fără să oprească restul", async () => {
    uploads.length = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("broken")) return new Response("nope", { status: 404 });
      return new Response(new Uint8Array([1]), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    };
    try {
      const stored = await mirrorListingImages(
        fakeStorage,
        "ext-2",
        ["https://cdn.example.com/broken.jpg", "https://cdn.example.com/ok.png"],
        "https://crm.test",
      );
      expect(stored).toHaveLength(1);
      expect(uploads).toHaveLength(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("respinge conținutul care nu este imagine", async () => {
    uploads.length = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } });
    try {
      const stored = await mirrorListingImages(
        fakeStorage,
        "ext-3",
        ["https://cdn.example.com/page.html"],
        "https://crm.test",
      );
      expect(stored).toHaveLength(0);
      expect(uploads).toHaveLength(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
