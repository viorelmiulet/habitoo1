import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/watermark.server", () => ({ ensureWatermarkedPath: async () => null }));
vi.mock("../media-compression.server", () => ({ fitImobiliareGallery: (images: unknown[]) => images }));
vi.mock("@/lib/site-feed/mapper", () => ({ isImageFeedEligible: () => true }));

import { encodeImobiliareImages } from "../media.server";
import { isRetryablePortalBulkError } from "../../bulk";

type Row = { id: string; storage_path: string | null };

function fakeAdmin(rows: Row[], download: (path: string) => Promise<{ data: Blob | null; error: unknown }>) {
  const query = (data: unknown) => {
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "order"]) q[k] = () => q;
    q.maybeSingle = async () => ({ data: null, error: null });
    q.then = (res: (v: unknown) => unknown) => res({ data, error: null });
    return q;
  };
  return {
    from: (table: string) => query(table === "property_images" ? rows : null),
    storage: { from: () => ({ download: vi.fn(download) }) },
  } as never;
}

const blob = () => new Blob([new Uint8Array([1, 2, 3])]);
const sleep = vi.fn(async () => {});

describe("encodeImobiliareImages — reîncercarea descărcărilor", () => {
  it("eșuează o dată, apoi reușește → galeria completă", async () => {
    let calls = 0;
    const admin = fakeAdmin([{ id: "a", storage_path: "a.jpg" }, { id: "b", storage_path: "b.jpg" }], async (path) => {
      if (path === "b.jpg" && calls++ === 0) return { data: null, error: { statusCode: "503", message: "Service Unavailable" } };
      return { data: blob(), error: null };
    });
    const out = await encodeImobiliareImages({ admin, organizationId: "o", propertyId: "p", sleep });
    expect(out.images).toHaveLength(2);
    expect(out.expected).toBe(2);
    expect(out.transient).toBeFalsy();
  });

  it("eșuează de 3 ori după prima încercare → nimic, eroarea reală, temporar", async () => {
    const download = vi.fn(async () => ({ data: null, error: { statusCode: "503", message: "Service Unavailable" } }));
    const admin = fakeAdmin([{ id: "a", storage_path: "a.jpg" }], download);
    const s = vi.fn(async () => {});
    const out = await encodeImobiliareImages({ admin, organizationId: "o", propertyId: "p", sleep: s });
    expect(out.images).toHaveLength(0);
    expect(out.transient).toBe(true);
    expect(s.mock.calls.map((c) => (c as unknown[])[0])).toEqual([500, 1500, 3000]);
    expect(out.warnings.join(" ")).toContain("Poza 1 nu a putut fi descărcată (storage: 503 Service Unavailable)");
    const message = `Eroare temporară: 0/${out.expected} poze trimise — ${out.warnings.join(" ")}`;
    expect(isRetryablePortalBulkError({ code: "PORTAL_ERROR", message, portalId: "imobiliare_ro" })).toBe(true);
  });

  it("poză fără storage_path → eroare de date, fără reîncercare", async () => {
    const download = vi.fn(async () => ({ data: blob(), error: null }));
    const admin = fakeAdmin([{ id: "a", storage_path: null }, { id: "b", storage_path: "b.jpg" }], download);
    const s = vi.fn(async () => {});
    const out = await encodeImobiliareImages({ admin, organizationId: "o", propertyId: "p", sleep: s });
    expect(out.images).toHaveLength(1);
    expect(out.transient).toBe(false);
    expect(s).not.toHaveBeenCalled();
    expect(out.warnings.join(" ")).toContain("nu are fișier disponibil");
  });
});
