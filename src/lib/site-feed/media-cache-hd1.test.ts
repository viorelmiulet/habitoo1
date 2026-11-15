import { afterEach, describe, expect, it, vi } from "vitest";
import { createMediaCache } from "./media-cache";

afterEach(() => { vi.useRealTimers(); vi.resetModules(); });

describe("HD1 media cache", () => {
  it("second request reuses signature; expired entry signs again", async () => {
    let now = 0;
    const cache = createMediaCache<string>((86400 - 300) * 1000, () => now);
    const sign = vi.fn(async () => `https://media.example/image.jpg?s=${now}`);
    const first = await cache("photo", sign);
    now = 100;
    expect(await cache("photo", sign)).toBe(first);
    expect(sign).toHaveBeenCalledTimes(1);
    now = (86400 - 300) * 1000;
    expect(await cache("photo", sign)).not.toBe(first);
    expect(sign).toHaveBeenCalledTimes(2);
  });

  it("shares concurrent misses and does not cache failures", async () => {
    const cache = createMediaCache<string>(1000);
    const missing = vi.fn(async () => null);
    expect(await Promise.all([cache("a", missing), cache("a", missing)])).toEqual([null, null]);
    expect(missing).toHaveBeenCalledTimes(1);
    await cache("a", missing);
    expect(missing).toHaveBeenCalledTimes(2);
  });

  it("warm media request does no database reads or signing; access expiry revalidates privacy", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { propertyMediaTarget, PUBLIC_MEDIA_ACCESS_TTL_MS, PUBLIC_MEDIA_SIGNED_TTL_MS } = await import("./property-media.server");
    const image = { url: null, storage_path: "org/photo.jpg", property_id: "p", organization_id: "o", include_in_publish: true, is_confidential: false };
    const property = { publish_status: "published", status: "active", deleted_at: null };
    const sign = vi.fn(async () => ({ data: { signedUrl: "https://media.example/photo.jpg?signature=test" } }));
    const from = vi.fn((table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: table === "property_images" ? image : table === "properties" ? property : { watermark_enabled: false }, error: null }) }) }) }));
    const db = { from, storage: { from: () => ({ createSignedUrl: sign }) } } as never;
    const id = "860209f3-1111-4111-8111-111111111111";
    expect(await propertyMediaTarget(id + ".jpg", null, db)).toContain("signature=test");
    expect(from).toHaveBeenCalledTimes(3);
    from.mockClear();
    const started = performance.now();
    expect(await propertyMediaTarget(id, null, db)).toContain("signature=test");
    expect(performance.now() - started).toBeLessThan(300);
    expect(from).not.toHaveBeenCalled();
    expect(sign).toHaveBeenCalledTimes(1);

    vi.setSystemTime(PUBLIC_MEDIA_ACCESS_TTL_MS);
    expect(await propertyMediaTarget(id, null, db)).toContain("signature=test");
    expect(from).toHaveBeenCalledTimes(3);
    expect(sign).toHaveBeenCalledTimes(1);

    vi.setSystemTime(PUBLIC_MEDIA_SIGNED_TTL_MS);
    await propertyMediaTarget(id, null, db);
    expect(sign).toHaveBeenCalledTimes(2);
    image.is_confidential = true;
    vi.setSystemTime(PUBLIC_MEDIA_SIGNED_TTL_MS + PUBLIC_MEDIA_ACCESS_TTL_MS);
    expect(await propertyMediaTarget(id, null, db)).toBeNull();
    expect(sign).toHaveBeenCalledTimes(2);
  });

  it.each([
    { include_in_publish: false, is_confidential: false, status: "active", publish_status: "published", deleted_at: null },
    { include_in_publish: true, is_confidential: true, status: "active", publish_status: "published", deleted_at: null },
    { include_in_publish: true, is_confidential: false, status: "active", publish_status: "unpublished", deleted_at: null },
    { include_in_publish: true, is_confidential: false, status: "active", publish_status: "published", deleted_at: "2026-11-15" },
  ] as const)("never signs ineligible media: %j", async (input) => {
    const { publishableImageTarget } = await import("./property-media.server");
    const sign = vi.fn();
    const db = { storage: { from: () => ({ createSignedUrl: sign }) } } as never;
    expect(await publishableImageTarget(db, { ...input, url: null, storage_path: "private.jpg" }, input, null)).toBeNull();
    expect(sign).not.toHaveBeenCalled();
  });
});