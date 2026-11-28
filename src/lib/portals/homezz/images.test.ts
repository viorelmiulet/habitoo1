import { describe, expect, it, vi } from "vitest";
import { prepareHomezzImages, HOMEZZ_IMAGE_CHECK_TIMEOUT_MS, homezzImageLogUrl } from "./images.server";
import { publishableImageTarget } from "@/lib/site-feed/property-media.server";
import { createHomezzAdapter } from "../adapters/homezz.server";
import type { HomezzOffer } from "./publish";

const id = "d4bce36a-9793-4b69-a9d0-8b72f6b5eb12";
const proxy = `https://crm.habitoo.ro/api/public/sites/v1/media/${id}`;
const property = { status: "active", publish_status: "published", deleted_at: null } as const;
const image = { id, storage_path: "photo.jpg", url: null, include_in_publish: true, is_confidential: false };
type Db = Parameters<typeof publishableImageTarget>[0];

function storage() {
  const sign = vi.fn(async (_path: string, _ttl: number, options?: { transform: { width?: number; height?: number; resize?: string } }) => ({
    error: null, data: { signedUrl: options
      ? `https://images.example.org/storage/v1/render/image/sign/property-media/photo.jpg?token=SIGNATURE&width=${options.transform.width}&height=${options.transform.height}&resize=${options.transform.resize}`
      : "https://images.example.org/storage/v1/object/sign/property-media/photo.jpg?token=ORIGINAL-SIGNATURE" },
  }));
  return { sign, db: { storage: { from: () => ({ createSignedUrl: sign }) } } as unknown as Db };
}

describe("HomeZZ direct images", () => {
  it("signs final resized URLs freshly for 25h and checks each once without redirects", async () => {
    const { db, sign } = storage();
    const probe = vi.fn(async () => new Response("jpeg", { headers: { "Content-Type": "image/jpeg" } }));
    const result = await prepareHomezzImages(db, [proxy], [image], property, null, { fetch: probe });
    expect(result.urls).toEqual([expect.stringContaining("/storage/v1/render/image/sign/")]);
    expect(result.urls[0]).not.toContain("/api/public/sites/v1/media/");
    expect(sign).toHaveBeenCalledWith("photo.jpg", 90000, { transform: { width: 1024, height: 768, resize: "contain", quality: 75 } });
    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledWith(result.urls[0], expect.objectContaining({ method: "GET", redirect: "manual", signal: expect.any(AbortSignal) }));
    expect(result.warnings).toEqual([]);
    await prepareHomezzImages(db, [proxy], [image], property, null, { fetch: probe });
    expect(sign).toHaveBeenCalledTimes(2); // No old cached signature shortens the remaining 24h.
    expect(HOMEZZ_IMAGE_CHECK_TIMEOUT_MS).toBe(8000);
  });

  it.each([400, 302, 500])("failed transformed image (%s) uses a checked original", async (status) => {
    const { db } = storage();
    const calls: string[] = [];
    const result = await prepareHomezzImages(db, [proxy], [image], property, null, { fetch: async (url) => {
      calls.push(url);
      return url.includes("/render/image/") ? new Response("{}", { status }) : new Response("jpeg", { headers: { "Content-Type": "image/jpeg" } });
    } });
    expect(calls).toHaveLength(2);
    expect(result.urls).toEqual([expect.stringContaining("/object/sign/")]);
    expect(result.warnings).toEqual([]);
  });

  it("unavailable transformation signing checks the original only once", async () => {
    const { db, sign } = storage();
    sign.mockImplementation(async (_path, _ttl, options) => options
      ? { error: null, data: { signedUrl: "" } }
      : { error: null, data: { signedUrl: "https://images.example.org/storage/v1/object/sign/photo.jpg?token=ORIGINAL-SIGNATURE" } });
    const probe = vi.fn(async () => new Response("jpeg", { headers: { "Content-Type": "image/jpeg" } }));
    const result = await prepareHomezzImages(db, [proxy], [image], property, null, { fetch: probe });
    expect(sign).toHaveBeenCalledTimes(2);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(result.urls[0]).toContain("/object/sign/");
    expect(result.warnings).toEqual([]);
  });

  it.each([404, 200])("invalid image (%s, JSON) omitted with nonblocking warning", async (status) => {
    const { db } = storage();
    const result = await prepareHomezzImages(db, [proxy], [image], property, null, { fetch: async () => new Response("{}", { status, headers: { "Content-Type": "application/json" } }) });
    expect(result).toEqual({ ids: [], urls: [], warnings: ["HomeZZ: 1 poze nu au putut fi pregătite"] });
  });

  it("network/timeout failure omits the image without retaining its capability", async () => {
    const { db } = storage();
    const result = await prepareHomezzImages(db, [proxy], [image], property, null, { fetch: async () => { throw new Error("SIGNATURE timeout"); } });
    expect(result.urls).toEqual([]);
    expect(result.warnings).toEqual(["HomeZZ: 1 poze nu au putut fi pregătite"]);
    expect(JSON.stringify(result)).not.toContain("SIGNATURE");
  });

  it("retains gallery order, caps at 18 and never resolves confidential images", async () => {
    const { db, sign } = storage();
    const gallery = Array.from({ length: 20 }, (_, i) => ({ ...image, id: `a0000000-0000-4000-8000-${String(i).padStart(12, "0")}`, storage_path: `${i}.jpg` }));
    gallery[1] = { ...image, id: "a0000000-0000-4000-8000-000000000001", is_confidential: true };
    const result = await prepareHomezzImages(db, gallery.map((i) => proxy.replace(id, i.id)), gallery, property, null, { fetch: async () => new Response("", { headers: { "Content-Type": "image/webp" } }) });
    expect(result.ids).toEqual(gallery.slice(0, 18).filter((i) => !i.is_confidential).map((i) => i.id));
    expect(sign).toHaveBeenCalledTimes(17);
    expect(result.warnings).toEqual(["HomeZZ: 1 poze nu au putut fi pregătite"]);
  });

  it("journal URLs keep dimensions, never signature credentials", () => {
    expect(homezzImageLogUrl("https://images.example.org/photo.jpg?token=SECRET&signature=SECRET2&width=1024&height=768&resize=contain#SECRET3"))
      .toBe("https://images.example.org/photo.jpg?width=1024&height=768&resize=contain");
  });

  it("prepared image reaches the update, saves a new hash and is not resent on the next update", async () => {
    const { db } = storage();
    const prepared = await prepareHomezzImages(db, [proxy], [image], property, null, { fetch: async () => new Response("jpeg", { headers: { "Content-Type": "image/jpeg" } }) });
    let stored: HomezzOffer[] = [{ transaction: "sale", reference: "16491", internal_id: "16491", id: "4315985", homezz_id: "4315985", url: "https://homezz.ro/ad.html", ljm_url: null, agent_email: "agent@example.org", deleted: false, photos_hash: id }];
    const bodies: URLSearchParams[] = [];
    const adapter = createHomezzAdapter(async (_url, init) => {
      bodies.push(new URLSearchParams(String(init.body)));
      return new Response(JSON.stringify({ meta: { code: 200 }, data: { id: 4315985, url: "https://homezz.ro/ad.html" } }));
    }, {
      load: async () => ({ mapping: { ok: true, ads: [{ transaction: "sale", params: { title: "Apartament", category: 1, price: 100 } }], warnings: [] }, reference: "HB-1649", assignedTo: "agent", agentEmail: "agent@example.org", stored, images: prepared }),
      withToken: async (_org, _agent, run) => run("TEST-TOKEN"),
    });
    if (!adapter.updateListing) throw new Error("Missing updateListing");
    const ctx = { organizationId: "org", portalCredential: "TEST-KEY", allowLiveRequests: true } as never;
    const first = await adapter.updateListing(ctx, { propertyId: "p", externalId: "4315985" });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("Expected success");
    expect(bodies[0]?.get("images[0]")).toBe(prepared.urls[0]);
    expect(bodies[0]?.get("images[0]")).toContain("/render/image/sign/");
    expect(JSON.stringify(first.data.portalResponse)).not.toContain("SIGNATURE");
    stored = first.data.offers as HomezzOffer[];
    await adapter.updateListing(ctx, { propertyId: "p", externalId: "4315985" });
    expect(bodies).toHaveLength(2);
    expect(bodies[1]?.has("images[0]")).toBe(false);
  });
});