import { beforeEach, describe, expect, it, vi } from "vitest";
import jpegJs from "jpeg-js";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../imobiliare/auth.server", () => ({ imobiliareAuthedRequest: request }));
vi.mock("@/lib/watermark.server", () => ({ ensureWatermarkedPath: async () => null }));
vi.mock("../imobiliare/media-compression.server", () => ({ fitImobiliareGallery: (images: unknown[]) => images }));
vi.mock("@/lib/site-feed/mapper", () => ({ isImageFeedEligible: () => true }));

import { photoWarning } from "../media-warning";
import { sendImobiliareGallery } from "../imobiliare/media-transfer.server";
import { encodeImobiliareImages } from "../imobiliare/media.server";
import { createVumsiAdapter } from "../adapters/vumsi.server";
import { resetVumsiClientState } from "../vumsi/client.server";
import type { VumsiPreview } from "../vumsi/preview.server";
import { matchingPropertyIds, parsePromotionSelection } from "../promotion-filter";

const ctx = { organizationId: "org", allowLiveRequests: true } as never;
const eight = Array.from({ length: 8 }, (_, i) => ({ dataUrl: `data:image/jpeg;base64,${i}`, bytes: 1 }));

describe("regula comună: poze parțiale = avertisment", () => {
  it("7 din 8 poze → text de avertisment; galerie completă → fără avertisment", () => {
    expect(photoWarning(7, 8, ["Poza 8 nu a putut fi citită."])).toBe("7 din 8 poze trimise – Poza 8 nu a putut fi citită.");
    expect(photoWarning(8, 8, ["x"])).toBeNull();
  });
});

describe("Imobiliare.ro", () => {
  beforeEach(() => request.mockReset());

  it("portalul confirmă 7 din 8 → reușit cu avertisment, nu eroare", async () => {
    request.mockImplementation(async (_s, call) => ({ ok: true, status: 200, classification: null,
      body: { data: call.method === "POST" ? [] : Array.from({ length: 7 }, (_, i) => ({ id: i + 1, order: i + 1, collection: "images" })) } }));
    const r = await sendImobiliareGallery({} as never, ctx, "HB-1", eight);
    expect(r).toMatchObject({ ok: true, sent: 7 });
    expect(r.ok && r.warning).toBe("7 din 8 poze trimise – Imobiliare.ro confirmă doar 7 fotografii după trimiterea galeriei complete.");
  });

  it("poza 8 nedescărcabilă se sare, celelalte 7 se pregătesc", async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ id: `i${i}`, storage_path: `p${i}.jpg` }));
    const q = (data: unknown) => { const o: Record<string, unknown> = {}; for (const k of ["select", "eq", "order"]) o[k] = () => o; o.maybeSingle = async () => ({ data: null, error: null }); o.then = (res: (v: unknown) => unknown) => res({ data, error: null }); return o; };
    let n = 0;
    const admin = { from: (t: string) => q(t === "property_images" ? rows : null),
      storage: { from: () => ({ download: async (p: string) => p === "p7.jpg" ? { data: null, error: { statusCode: "404", message: "Not found" } } : { data: new Blob([new Uint8Array([n++])]), error: null } }) } } as never;
    const out = await encodeImobiliareImages({ admin, organizationId: "org", propertyId: "p", sleep: async () => {} });
    expect(out.images).toHaveLength(7);
    expect(out.expected).toBe(8);
    expect(photoWarning(out.images.length, out.expected, out.warnings)).toContain("7 din 8 poze trimise – Poza 8 nu a putut fi descărcată");
  });
});

describe("Vumsi", () => {
  const JPG = new Uint8Array(jpegJs.encode({ data: new Uint8Array(256).fill(200), width: 8, height: 8 }, 90).data);
  const json = (status: number, body: unknown) => new Response(JSON.stringify({ status: status < 400 ? "ok" : "error", code: status, data: body }), { status, headers: { "Content-Type": "application/json" } });
  const LU = "aaaaaaaa-0000-0000-0000-000000000001";
  const preview: VumsiPreview = {
    ok: true, setupMissing: false, reasons: [], warnings: [], cityId: 9, cityName: "X",
    plans: [{ transaction: "sale", externalId: "HBT-p1-V", category: { id: 461, name: "A" }, type: 1, attrs: {}, reasons: [],
      body: { title: "T", description: "D", type: 1, category: 461, external_id: "HBT-p1-V", external_user_id: "u1", price: { amount: 1, currency: "EUR" }, location: { city_id: 9 }, attrs: {} } }],
    user: { payload: { email: "a@x.ro", first_name: "A", last_name: "B", phone: null, external_user_id: "u1", account_type: "business" }, vumsiUuid: "uuuu", checked: true },
    company: { payload: { external_company_id: "o1", owner: { user_uuid: "uuuu", external_user_id: "u1" }, name: "X", company_number: "1", city: "C", country: "RO", line1: "S" }, vumsiUuid: "cccc", checked: true },
  } as never;
  beforeEach(() => resetVumsiClientState());

  function adapterWith(route: (m: string, p: string) => Response) {
    const calls: string[] = [];
    const fetch = vi.fn(async (url: string, init: RequestInit) => { const p = url.replace("https://vumsi.com/api/orion", ""); calls.push(`${init.method} ${p}`); return route(init.method!, p); });
    const adapter = createVumsiAdapter({
      env: { VUMSI_API_KEY: "vumsi_test_key_123456" }, fetch: fetch as never, sleep: async () => {},
      preview: async () => preview,
      images: async () => ({ images: Array.from({ length: 8 }, (_, i) => ({ source: `img${i}`, url: `https://x/${i}` })), warnings: [] }),
      fetchImage: async () => new Blob([JPG as BlobPart], { type: "image/jpeg" }),
      loadStored: async () => [], save: async () => {}, saveAccount: async () => {},
      propertyState: async () => ({ status: "active", deleted_at: null }) as never,
    });
    return { adapter, calls };
  }

  it("încărcarea pozei 8 eșuează după creare → anunțul se publică cu 7, avertisment", async () => {
    let img = 0;
    const { adapter, calls } = adapterWith((m, p) => {
      if (p.startsWith("/listings/by-external-id/")) return json(404, { errors: "nu" });
      if (m === "POST" && p === "/listings/") return json(201, { uuid: LU, status: 3 });
      if (p.endsWith("/images/")) return ++img === 8 ? json(400, { errors: { image: ["Invalid."] } }) : json(201, { id: img });
      if (p.endsWith("/publish/")) return json(200, { uuid: LU, status: 1, url: "https://vumsi.com/a/1" });
      return json(500, {});
    });
    const r = await adapter.publishListing(ctx, { propertyId: "p1", externalId: null });
    expect(r.ok).toBe(true);
    expect(calls.at(-1)).toBe(`POST /listings/${LU}/publish/`);
    expect(r.ok && r.data.mediaWarning).toMatch(/^7 din 8 poze trimise – /);
  });

  it("anunțul respins de Vumsi rămâne eroare", async () => {
    const { adapter } = adapterWith((m, p) => {
      if (p.startsWith("/listings/by-external-id/")) return json(404, { errors: "nu" });
      if (m === "POST" && p === "/listings/") return json(400, { errors: { price: ["Obligatoriu."] } });
      return json(500, {});
    });
    const r = await adapter.publishListing(ctx, { propertyId: "p1", externalId: null });
    expect(r.ok).toBe(false);
  });
});

describe("filtrul „Cu erori”", () => {
  it("un anunț publicat cu avertisment de poze nu apare la erori", () => {
    const rows = [
      { property_id: "warn", portal_key: "vumsi", enabled: true, status: "published", last_warning: "7 din 8 poze trimise" },
      { property_id: "err", portal_key: "vumsi", enabled: true, status: "error" },
    ];
    expect(matchingPropertyIds(parsePromotionSelection("vumsi:error"), new Map(), new Map(), rows as never, ["warn", "err"])).toEqual(["err"]);
  });
});
