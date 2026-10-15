import { describe, expect, it, vi } from "vitest";
import { buildAttachedMedia, canPostForProperty, classifyMetaError, planMetaPost, withOfferLink } from "./post-core";
import { publishToMetaPage } from "./post.server";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("postare Facebook", () => {
  it("alege endpointul după tip", () => {
    expect(planMetaPost("photos", 1)).toEqual([{ endpoint: "photos", mode: "url", published: true }]);
    const many = planMetaPost("photos", 3);
    expect(many.filter((s) => s.endpoint === "photos")).toHaveLength(3);
    expect(many.at(-1)).toEqual({ endpoint: "feed", withAttachedMedia: true, withLink: false });
    expect(planMetaPost("poster")[0]).toMatchObject({ endpoint: "photos", mode: "source" });
    expect(planMetaPost("video")[0]).toMatchObject({ endpoint: "videos" });
    expect(planMetaPost("link")[0]).toMatchObject({ endpoint: "feed", withLink: true });
    expect(() => planMetaPost("photos", 11)).toThrow();
  });

  it("construiește attached_media", () => {
    expect(buildAttachedMedia(["11", "22"])).toEqual({
      "attached_media[0]": '{"media_fbid":"11"}',
      "attached_media[1]": '{"media_fbid":"22"}',
    });
  });

  it("textul conține linkul /oferta/<id>", () => {
    const t = withOfferLink("Apartament", "abc");
    expect(t).toBe("Apartament\n\nhttps://www.habitoo.ro/oferta/abc");
    expect(withOfferLink(t, "abc")).toBe(t);
  });

  it("mai multe poze: încărcare nepublicată, apoi feed cu attached_media", async () => {
    const calls: { url: string; body: string }[] = [];
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: String(init?.body ?? "") });
      if (url.includes("/photos")) return ok({ id: `m${calls.length}` });
      if (url.includes("/feed")) return ok({ id: "page_post" });
      return ok({ permalink_url: "https://facebook.com/p/1" });
    });
    const r = await publishToMetaPage(
      { pageId: "P", pageToken: "T", kind: "photos", message: "x", link: "l", photoUrls: ["a.jpg", "b.jpg"] },
      f as unknown as typeof fetch,
    );
    expect(calls[0]!.body).toContain("published=false");
    expect(decodeURIComponent(calls[2]!.body)).toContain('attached_media[0]={"media_fbid":"m1"}');
    expect(r).toEqual({ postId: "page_post", permalink: "https://facebook.com/p/1" });
  });

  it("eroarea 190 = conexiune expirată", async () => {
    expect(classifyMetaError({ error: { code: 190, message: "x" } }).kind).toBe("expired");
    expect(classifyMetaError({ error: { code: 10 } }).kind).toBe("permission");
    expect(classifyMetaError({ error: { code: 200 } }).kind).toBe("permission");
    expect(classifyMetaError({ error: { code: 324, message: "Imagine invalidă" } }).message).toContain("Imagine invalidă");
    const f = async () => new Response(JSON.stringify({ error: { code: 190 } }), { status: 400 });
    await expect(
      publishToMetaPage({ pageId: "P", pageToken: "T", kind: "link", message: "m", link: "l" }, f as unknown as typeof fetch),
    ).rejects.toMatchObject({ kind: "expired" });
  });

  it("un agent nu poate posta pentru proprietatea altui agent", () => {
    expect(canPostForProperty({ role: "agent", userId: "a", assignedTo: "b" })).toBe(false);
    expect(canPostForProperty({ role: "agent", userId: "a", assignedTo: null })).toBe(false);
    expect(canPostForProperty({ role: "agent", userId: "a", assignedTo: "a" })).toBe(true);
    expect(canPostForProperty({ role: "agency_admin", userId: "a", assignedTo: "b" })).toBe(true);
    expect(canPostForProperty({ role: "superadmin", userId: "a", assignedTo: null })).toBe(true);
  });
});
