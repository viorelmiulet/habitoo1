import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/watermark.server", () => ({ ensureWatermarkedPath: async () => null }));
vi.mock("../media-compression.server", () => ({ fitImobiliareGallery: (images: unknown[]) => images }));
vi.mock("@/lib/site-feed/mapper", () => ({ isImageFeedEligible: () => true }));
vi.mock("../auth.server", () => ({ imobiliareAuthedRequest: mocks.request }));

import { encodeImobiliareImages } from "../media.server";
import { sendImobiliareGallery } from "../media-transfer.server";

function fakeAdmin(rows: { id: string; storage_path: string }[], files: Record<string, number[]>) {
  const query = (data: unknown) => {
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "order"]) q[k] = () => q;
    q.maybeSingle = async () => ({ data: null, error: null });
    q.then = (res: (v: unknown) => unknown) => res({ data, error: null });
    return q;
  };
  return {
    from: (table: string) => query(table === "property_images" ? rows : null),
    storage: { from: () => ({ download: async (p: string) => ({ data: new Blob([new Uint8Array(files[p]!)]), error: null }) }) },
  } as never;
}

const eight = Array.from({ length: 8 }, (_, i) => ({ id: `i${i + 1}`, storage_path: `p${i + 1}.jpg` }));

describe("encodeImobiliareImages — poze identice", () => {
  it("duplicat → 7 trimise, verificarea cu 7 trece, avertisment", async () => {
    const files: Record<string, number[]> = {};
    eight.forEach((r, i) => (files[r.storage_path] = [i, 1, 2]));
    files["p5.jpg"] = files["p2.jpg"]!;
    const out = await encodeImobiliareImages({ admin: fakeAdmin(eight, files), organizationId: "o", propertyId: "p" });
    expect(out.images).toHaveLength(7);
    expect(out.expected).toBe(7);
    expect(out.images.map((i) => i.imageId)).toEqual(["i1", "i2", "i3", "i4", "i6", "i7", "i8"]);
    expect(out.warnings).toContain("Poza 5 e identică cu poza 2 și a fost trimisă o singură dată.");

    mocks.request.mockReset();
    mocks.request.mockResolvedValueOnce({ ok: true, status: 200, body: {} });
    mocks.request.mockResolvedValueOnce({ ok: true, status: 200, body: { data: Array.from({ length: 7 }, (_, i) => ({ collection: "images", id: i, order: i })) } });
    const sent = await sendImobiliareGallery({} as never, { organizationId: "o" } as never, "HB-1089", out.images);
    expect(sent.ok).toBe(true);
    expect(mocks.request.mock.calls[0]![1].body.images).toHaveLength(7);
  });

  it("fără duplicate → toate, fără avertisment", async () => {
    const files: Record<string, number[]> = {};
    eight.forEach((r, i) => (files[r.storage_path] = [i, 1, 2]));
    const out = await encodeImobiliareImages({ admin: fakeAdmin(eight, files), organizationId: "o", propertyId: "p" });
    expect(out.images).toHaveLength(8);
    expect(out.expected).toBe(8);
    expect(out.warnings).toEqual([]);
  });
});
