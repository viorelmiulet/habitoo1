import { describe, expect, it, vi } from "vitest";
import { loadZonataImages } from "./context.server";
import { zonataPreviewBodies } from "./preview";
import type { ZonataListingBody } from "./mapper";

describe("ZonaTa direct images", () => {
  it("signs only publicable, nonconfidential photos once for 24h, primary first", async () => {
    const rows = [
      { property_id: "p", storage_path: "org/last.jpg", position: 2, include_in_publish: true },
      { property_id: "p", storage_path: "org/private.jpg", position: 0, include_in_publish: true, is_confidential: true },
      { property_id: "p", storage_path: "org/disabled.jpg", position: 0, include_in_publish: false },
      { property_id: "p", storage_path: "org/first.jpg", position: 10, is_primary: true, include_in_publish: true },
      { property_id: "p", storage_path: "org/middle.jpg", position: 1, include_in_publish: true },
    ];
    const sign = vi.fn(async (paths: string[]) => ({ data: [...paths].reverse().map(path => ({ path, signedUrl: `https://storage.example/${path}?token=private` })), error: null }));
    const query = { select: () => query, eq: vi.fn(() => query), in: vi.fn(async () => ({ data: rows, error: null })) };
    const bucket = vi.fn(() => ({ createSignedUrls: sign }));
    const result = await loadZonataImages({ from: () => query, storage: { from: bucket } }, "org", ["p"]);
    expect(query.eq).toHaveBeenCalledWith("organization_id", "org");
    expect(query.in).toHaveBeenCalledWith("property_id", ["p"]);
    expect(bucket).toHaveBeenCalledWith("property-media");
    expect(sign).toHaveBeenCalledTimes(1);
    expect(sign).toHaveBeenCalledWith(["org/first.jpg", "org/middle.jpg", "org/last.jpg"], 86400);
    expect(result.get("p")?.map(i => i.url)).toEqual(["first", "middle", "last"].map(name => `https://storage.example/org/${name}.jpg?token=private`));
  });
  it("does not sign anything for an empty property list", async () => {
    const from = vi.fn();
    expect(await loadZonataImages({ from }, "org", [])).toEqual(new Map());
    expect(from).not.toHaveBeenCalled();
  });
  it("fails safely when batch signing fails, without exposing the provider error", async () => {
    const query = { select: () => query, eq: () => query, in: async () => ({ data: [{ property_id: "p", storage_path: "p.jpg", include_in_publish: true }] }) };
    await expect(loadZonataImages({ from: () => query, storage: { from: () => ({ createSignedUrls: async () => ({ error: { message: "secret" } }) }) } }, "org", ["p"])).rejects.toThrow("Fotografiile ZonaTa nu au putut fi semnate.");
  });
  it("preview includes only file paths, never signed tokens", () => {
    const url = "https://storage.example/storage/v1/object/sign/property-media/org/a.jpg?token=private";
    const bodies = [{ images: [url] }] as ZonataListingBody[];
    const preview = zonataPreviewBodies(bodies, [{ url, path: "org/a.jpg" }]);
    expect(preview[0]?.images).toEqual(["org/a.jpg"]);
    expect(bodies[0]?.images).toEqual([url]);
  });
});