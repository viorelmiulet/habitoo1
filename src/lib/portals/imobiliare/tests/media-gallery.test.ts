import { beforeEach, describe, expect, it, vi } from "vitest";
import jpeg from "jpeg-js";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../auth.server", () => ({ imobiliareAuthedRequest: request }));
import { sendImobiliareGallery } from "../media-transfer.server";
import { fitImobiliareGallery, mediaRequestBytes } from "../media-compression.server";
import type { PortalContext } from "../../adapter";
const ctx = { organizationId: "org" } as PortalContext;
const images = Array.from({ length: 8 }, (_, i) => ({ dataUrl: `data:image/jpeg;base64,${i}`, bytes: 1 }));
let gallery: { id: number; order: number; collection: string }[];
beforeEach(() => {
  gallery = [];
  request.mockReset();
  request.mockImplementation(async (_session, call) => {
    if (call.method === "POST") gallery = call.body.images.map((_image: string, i: number) => ({ id: i + 1, order: i + 1, collection: "images" }));
    return { ok: true, status: 200, body: { data: gallery }, classification: null };
  });
});
describe("Imobiliare replacement gallery", () => {
  it("8 photos use exactly one POST containing all 8", async () => {
    expect(await sendImobiliareGallery({} as never, ctx, "HB-1111", images)).toMatchObject({ ok: true, sent: 8 });
    const posts = request.mock.calls.filter(call => call[1].method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]?.[1].body.images).toHaveLength(8);
  });
  it("preserves the first/main photo and all following CRM positions", async () => {
    await sendImobiliareGallery({} as never, ctx, "HB-1111", images);
    expect(request.mock.calls[0]?.[1].body.images).toEqual(images.map(image => image.dataUrl));
    expect(request.mock.calls[0]?.[1].body.images[0]).toBe(images[0]?.dataUrl);
  });
  it("republishing replaces old photos and cannot append duplicates", async () => {
    gallery = [{ id: 99, order: 1, collection: "images" }];
    await sendImobiliareGallery({} as never, ctx, "HB-1111", images);
    await sendImobiliareGallery({} as never, ctx, "HB-1111", images);
    expect(gallery).toHaveLength(8);
    expect(gallery.some(image => image.id === 99)).toBe(false);
    expect(request.mock.calls.filter(call => call[1].method === "POST")).toHaveLength(2);
  });
  it("reports partial acceptance, never assumes 200 means all photos", async () => {
    request.mockResolvedValue({ ok: true, status: 200, body: { data: [{ id: 1, order: 1, collection: "images" }] } });
    const result = await sendImobiliareGallery({} as never, ctx, "HB-1111", images);
    expect(result).toMatchObject({ ok: false, fail: { message: expect.stringContaining("1/8") } });
  });
  it("does not silently truncate a gallery over 30", async () => {
    expect((await sendImobiliareGallery({} as never, ctx, "HB-1111", Array.from({ length: 31 }, () => images[0] ?? { dataUrl: "", bytes: 0 }))).ok).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
  it("compresses oversized JPEG to max 1920 while retaining every image ID and order", () => {
    const width = 1921, height = 2;
    const raster = new Uint8Array(width * height * 4).fill(255);
    const encoded = jpeg.encode({ data: raster, width, height }, 100).data;
    const photo = { imageId: "first", bytes: encoded.length, dataUrl: `data:image/jpeg;base64,${Buffer.from(encoded).toString("base64")}` };
    const second = { ...photo, imageId: "second" };
    const budget = mediaRequestBytes([photo, second]) - 1;
    const fitted = fitImobiliareGallery([photo, second], budget);
    expect(fitted.map(image => image.imageId)).toEqual(["first", "second"]);
    expect(mediaRequestBytes(fitted)).toBeLessThanOrEqual(budget);
    const decoded = jpeg.decode(Buffer.from(fitted[0]?.dataUrl.split(",")[1] ?? "", "base64"));
    expect(Math.max(decoded.width, decoded.height)).toBe(1920);
  });
});