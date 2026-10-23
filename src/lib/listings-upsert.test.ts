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

describe("toLenientNumber (câmpuri numerice trimise ca text de hbsync)", () => {
  it("transformă textul numeric în număr", async () => {
    const { toLenientNumber } = await import("@/routes/api/public/listings/upsert");
    expect(toLenientNumber("4", { int: true })).toBe(4);
    expect(toLenientNumber("P+4", { int: true })).toBe(4);
    expect(toLenientNumber("120,5 mp")).toBe(120.5);
  });
  it("textul gol sau fără cifre devine null", async () => {
    const { toLenientNumber } = await import("@/routes/api/public/listings/upsert");
    expect(toLenientNumber("", { int: true })).toBeNull();
    expect(toLenientNumber("nespecificat")).toBeNull();
  });
  it("numerele rămân neschimbate", async () => {
    const { toLenientNumber } = await import("@/routes/api/public/listings/upsert");
    expect(toLenientNumber(7, { int: true })).toBe(7);
    expect(toLenientNumber(null)).toBeNull();
  });
});

describe("normalizeListingUrl (linkul real al anunțului)", () => {
  it("transformă linkurile Storia /ro/ad/ (404) în /ro/oferta/", async () => {
    const { normalizeListingUrl } = await import("@/routes/api/public/listings/upsert");
    expect(
      normalizeListingUrl("storia", "https://www.storia.ro/ro/ad/garsonier-aparatorii-patriei-IDIm8a", "x"),
    ).toBe("https://www.storia.ro/ro/oferta/garsonier-aparatorii-patriei-IDIm8a");
  });
  it("reface linkul Storia din id când lipsește", async () => {
    const { normalizeListingUrl } = await import("@/routes/api/public/listings/upsert");
    expect(normalizeListingUrl("storia", null, "cloud9-apartament-IDIYWW")).toBe(
      "https://www.storia.ro/ro/oferta/cloud9-apartament-IDIYWW",
    );
  });
  it("reface linkul Romimo din id când lipsește", async () => {
    const { normalizeListingUrl } = await import("@/routes/api/public/listings/upsert");
    expect(normalizeListingUrl("romimo", null, "0444e7f590hd7242d0i6ifg63457if12.html", "Calea Vitan")).toBe(
      "https://www.romimo.ro/anunturi/anunt/calea-vitan/0444e7f590hd7242d0i6ifg63457if12.html",
    );
  });
  it("nu inventează linkuri pentru id-uri necunoscute", async () => {
    const { normalizeListingUrl } = await import("@/routes/api/public/listings/upsert");
    expect(normalizeListingUrl("olx", null, "123")).toBeNull();
  });
});

describe("phoneFromText", () => {
  it("găsește un mobil românesc în descriere", async () => {
    const { phoneFromText } = await import("@/routes/api/public/listings/upsert");
    expect(phoneFromText("Sunați la 0722 123 456 oricând")).toBe("0722123456");
    expect(phoneFromText("Tel +40 744-555-666")).toBe("0744555666");
    expect(phoneFromText("Telefon validat")).toBeNull();
  });
});

describe("preserveExistingFields", () => {
  it("nu șterge linkul, telefonul sau pozele salvate când batch-ul nu le are", async () => {
    const { preserveExistingFields } = await import("@/routes/api/public/listings/upsert");
    const rows: Record<string, unknown>[] = [{ source: "olx", external_id: "a", url: null, phone: null }];
    preserveExistingFields(rows, [
      { source: "olx", external_id: "a", url: "https://www.olx.ro/d/oferta/x", phone: "0722123456", images: ["i"] },
    ]);
    expect(rows[0]).toMatchObject({ url: "https://www.olx.ro/d/oferta/x", phone: "0722123456", images: ["i"] });
  });
});

describe("parseStoriaPrice", () => {
  it("citește prețul de vânzare și de închiriere din pagina Storia", async () => {
    const { parseStoriaPrice } = await import("@/routes/api/public/listings/upsert");
    expect(parseStoriaPrice('"salePrice":{"value":180000,"currency":"EUR"')).toEqual({ price: 180000, currency: "EUR" });
    expect(parseStoriaPrice('"rentalPrice":{"value":1299,"currency":"EUR"')).toEqual({ price: 1299, currency: "EUR" });
    expect(parseStoriaPrice("<html>fără preț</html>")).toBeNull();
  });
});
