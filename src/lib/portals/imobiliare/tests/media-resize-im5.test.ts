import { describe, expect, it, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ budget: 8 * 1024 * 1024 }));

vi.mock("jpeg-js", async (orig) => {
  const real = (await orig()) as { default: { decode: (...a: unknown[]) => unknown; encode: (...a: unknown[]) => unknown } };
  const decode = vi.fn((...a: unknown[]) => real.default.decode(...a));
  const encode = vi.fn((...a: unknown[]) => real.default.encode(...a));
  return { default: { decode, encode }, decode, encode };
});
vi.mock("../config", async (orig) => ({
  ...((await orig()) as object),
  get IMOBILIARE_MAX_MEDIA_REQUEST_BYTES() { return h.budget; },
}));
vi.mock("@/lib/watermark.server", () => ({ ensureWatermarkedPath: async () => null }));
vi.mock("@/lib/site-feed/mapper", () => ({ isImageFeedEligible: () => true }));

import jpeg from "jpeg-js";
import { encodeImobiliareImages, IMOBILIARE_PHOTO_TRANSFORM } from "../media.server";
import { mediaRequestBytes } from "../media-compression.server";

type Download = (path: string, options?: { transform?: unknown }) => Promise<{ data: Blob | null; error: unknown }>;
function fakeAdmin(count: number, download: Download) {
  const rows = Array.from({ length: count }, (_, i) => ({ id: `i${i + 1}`, storage_path: `org/p/${i + 1}.jpg` }));
  const query = (data: unknown) => {
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "order"]) q[k] = () => q;
    q.maybeSingle = async () => ({ data: null, error: null });
    q.then = (res: (v: unknown) => unknown) => res({ data, error: null });
    return q;
  };
  const spy = vi.fn(download);
  return { spy, admin: { from: (t: string) => query(t === "property_images" ? rows : null), storage: { from: () => ({ download: spy }) } } as never };
}

/** Distinct bytes per photo so the duplicate check keeps all of them. */
function bigBytes(seed: number, size: number) {
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i++) out[i] = (i * 31 + seed * 17) & 0xff;
  return out;
}

function gradientJpeg(seed: number, side = 240) {
  const data = new Uint8Array(side * side * 4);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const o = (y * side + x) * 4;
    data[o] = (x + seed * 13) & 0xff; data[o + 1] = (y * 2) & 0xff; data[o + 2] = ((x ^ y) + seed) & 0xff; data[o + 3] = 255;
  }
  return new Uint8Array(jpeg.encode({ data, width: side, height: side }, 100).data);
}

beforeEach(() => {
  vi.mocked(jpeg.decode).mockClear();
  vi.mocked(jpeg.encode).mockClear();
  h.budget = 8 * 1024 * 1024;
});

describe("IM5 — poze redimensionate din storage", () => {
  it("8 poze mari: transformarea din storage încape în buget, fără jpeg-js", async () => {
    const { admin, spy } = fakeAdmin(8, async (path, options) => {
      const n = Number(path.match(/(\d+)\.jpg$/)![1]);
      // Original ~800 KB (8 × base64 > 8 MB); variantă redimensionată ~250 KB.
      return { data: new Blob([bigBytes(n, options?.transform ? 250_000 : 800_000)]), error: null };
    });
    const steps: [string, number][] = [];
    const out = await encodeImobiliareImages({ admin, organizationId: "o", propertyId: "p", onStep: (s, n) => { steps.push([s, n]); } });

    expect(out.images).toHaveLength(8);
    expect(mediaRequestBytes(out.images)).toBeLessThanOrEqual(8 * 1024 * 1024);
    expect(jpeg.decode).not.toHaveBeenCalled();
    expect(jpeg.encode).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledTimes(8);
    for (const call of spy.mock.calls) expect(call[1]).toEqual({ transform: { width: 1600, height: 1600, resize: "contain", quality: 80, format: "origin" } });
    expect(IMOBILIARE_PHOTO_TRANSFORM.format).toBe("origin");
    expect(steps).toEqual(Array.from({ length: 8 }, (_, i) => ["photo_resize", i + 1]));
  });

  it("transformarea eșuează: fiecare poză e decodată cel mult o dată, galeria încape", async () => {
    const originals = Array.from({ length: 8 }, (_, i) => gradientJpeg(i + 1));
    const { admin } = fakeAdmin(8, async (path, options) => {
      if (options?.transform) return { data: null, error: { statusCode: "400", message: "transform unavailable" } };
      const n = Number(path.match(/(\d+)\.jpg$/)![1]);
      return { data: new Blob([originals[n - 1]!]), error: null };
    });
    const full = mediaRequestBytes(originals.map((b) => ({ dataUrl: `data:image/jpeg;base64,${Buffer.from(b).toString("base64")}` })));
    h.budget = Math.floor(full / 2);
    vi.mocked(jpeg.encode).mockClear();
    const steps: [string, number][] = [];
    const out = await encodeImobiliareImages({ admin, organizationId: "o", propertyId: "p", onStep: (s, n) => { steps.push([s, n]); } });

    expect(out.images.map((i) => i.imageId)).toEqual(["i1", "i2", "i3", "i4", "i5", "i6", "i7", "i8"]);
    expect(mediaRequestBytes(out.images)).toBeLessThanOrEqual(h.budget);
    expect(vi.mocked(jpeg.decode).mock.calls.length).toBeLessThanOrEqual(8);
    expect(vi.mocked(jpeg.encode).mock.calls.length).toBeLessThanOrEqual(8);
    const compressed = steps.filter(([s]) => s === "photo_compress").map(([, n]) => n);
    expect(compressed.length).toBe(vi.mocked(jpeg.decode).mock.calls.length);
    expect(new Set(compressed).size).toBe(compressed.length);
  });

  it("transformarea eșuează dar originalele încap: se trimit originalele, fără compresie", async () => {
    const originals = Array.from({ length: 3 }, (_, i) => gradientJpeg(i + 1, 32));
    const { admin } = fakeAdmin(3, async (path, options) => {
      if (options?.transform) throw new Error("network");
      const n = Number(path.match(/(\d+)\.jpg$/)![1]);
      return { data: new Blob([originals[n - 1]!]), error: null };
    });
    vi.mocked(jpeg.encode).mockClear();
    const out = await encodeImobiliareImages({ admin, organizationId: "o", propertyId: "p" });
    expect(out.images).toHaveLength(3);
    expect(jpeg.encode).not.toHaveBeenCalled();
    expect(out.images[0]!.bytes).toBe(originals[0]!.byteLength);
    expect(jpeg.decode).not.toHaveBeenCalled();
  });
});
