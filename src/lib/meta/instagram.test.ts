import { describe, expect, it } from "vitest";
import { buildInstagramCaption, classifyInstagramError, cropRect, planInstagramPost, validateInstagramCaption } from "./instagram-core";
import { publishToInstagram } from "./instagram.server";

const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });

function fakeGraph(status = "FINISHED") {
  const calls: { url: string; body: string; method: string }[] = [];
  let n = 0;
  const f = async (url: string, init?: RequestInit) => {
    calls.push({ url, body: String(init?.body ?? ""), method: init?.method ?? "GET" });
    if (url.includes("/media_publish")) return ok({ id: "MEDIA" });
    if (url.includes("/media")) return ok({ id: `c${++n}` });
    if (url.includes("fields=status_code")) return ok({ status_code: status });
    if (url.includes("fields=permalink")) return ok({ permalink: "https://instagram.com/p/X" });
    return ok({});
  };
  return { calls, f: f as unknown as typeof fetch };
}

describe("postare Instagram", () => {
  it("o poză: container cu image_url și caption, apoi media_publish și permalink", async () => {
    const g = fakeGraph();
    const r = await publishToInstagram({ igUserId: "IG", token: "T", kind: "ig_photo", caption: "Text", media: { images: ["https://x/a.jpg"] } }, { fetch: g.f });
    expect(g.calls[0]!.url).toContain("/IG/media");
    expect(g.calls[0]!.body).toContain("image_url=https%3A%2F%2Fx%2Fa.jpg");
    expect(g.calls[0]!.body).toContain("caption=Text");
    expect(g.calls[1]!.url).toContain("/IG/media_publish");
    expect(g.calls[1]!.body).toContain("creation_id=c1");
    expect(r).toEqual({ status: "published", mediaId: "MEDIA", permalink: "https://instagram.com/p/X" });
  });

  it("album: item-uri is_carousel_item, apoi CAROUSEL cu children", async () => {
    const g = fakeGraph();
    await publishToInstagram({ igUserId: "IG", token: "T", kind: "ig_album", caption: "C", media: { images: ["a", "b", "c"] } }, { fetch: g.f });
    expect(g.calls.slice(0, 3).every((c) => c.body.includes("is_carousel_item=true"))).toBe(true);
    expect(g.calls[3]!.body).toContain("media_type=CAROUSEL");
    expect(decodeURIComponent(g.calls[3]!.body)).toContain("children=c1,c2,c3");
    expect(g.calls[4]!.url).toContain("media_publish");
  });

  it("album: maximum 10 poze, minimum 2", () => {
    expect(() => planInstagramPost("ig_album", { images: Array(11).fill("x") }, "")).toThrow(/10/);
    expect(() => planInstagramPost("ig_album", { images: ["x"] }, "")).toThrow();
    expect(planInstagramPost("ig_album", { images: Array(10).fill("x") }, "").length).toBe(12);
  });

  it("Reel: REELS + share_to_feed, așteaptă FINISHED, apoi publică", async () => {
    const g = fakeGraph("FINISHED");
    const r = await publishToInstagram({ igUserId: "IG", token: "T", kind: "ig_reel", caption: "C", media: { images: [], videoUrl: "https://x/v.mp4" } }, { fetch: g.f, sleep: async () => {} });
    expect(g.calls[0]!.body).toContain("media_type=REELS");
    expect(g.calls[0]!.body).toContain("share_to_feed=true");
    expect(g.calls[0]!.body).toContain("video_url=");
    expect(g.calls[1]!.url).toContain("fields=status_code");
    expect(r.status).toBe("published");
  });

  it("Reel care nu ajunge la FINISHED în 5 minute trece în fundal", async () => {
    const g = fakeGraph("IN_PROGRESS");
    let t = 0;
    const r = await publishToInstagram(
      { igUserId: "IG", token: "T", kind: "ig_reel", caption: "C", media: { images: [], videoUrl: "v" } },
      { fetch: g.f, now: () => t, sleep: async (ms) => { t += ms; } },
    );
    expect(r).toEqual({ status: "processing", containerId: "c1" });
    expect(g.calls.filter((c) => c.url.includes("status_code")).length).toBe(61);
    expect(g.calls.some((c) => c.url.includes("media_publish"))).toBe(false);
  });

  it("story: STORIES cu image_url sau video_url, fără caption", () => {
    expect(planInstagramPost("ig_story", { images: ["p.jpg"] }, "x")[0]).toEqual({ op: "container", params: { media_type: "STORIES", image_url: "p.jpg" } });
    const v = planInstagramPost("ig_story", { images: [], videoUrl: "v.mp4" }, "x");
    expect(v[0]).toEqual({ op: "container", params: { media_type: "STORIES", video_url: "v.mp4" } });
    expect(v[1]).toEqual({ op: "wait" });
  });

  it("decupare centrată la 4:5 și 1:1, latura lungă ≤ 1440", () => {
    expect(cropRect(4000, 3000, "4:5")).toEqual({ sx: 800, sy: 0, sw: 2400, sh: 3000, outW: 1152, outH: 1440 });
    expect(cropRect(4000, 3000, "1:1")).toEqual({ sx: 500, sy: 0, sw: 3000, sh: 3000, outW: 1440, outH: 1440 });
    expect(cropRect(800, 2000, "4:5")).toEqual({ sx: 0, sy: 500, sw: 800, sh: 1000, outW: 800, outH: 1000 });
  });

  it("descrierea fără link, cu telefonul agentului și limita de 2.200 de caractere", () => {
    const c = buildInstagramCaption("Apartament 3 camere\n\nhttps://www.habitoo.ro/oferta/abc", "0722 111 222");
    expect(c).toBe("Apartament 3 camere\n\nDetalii: 0722 111 222");
    expect(c).not.toContain("http");
    expect(validateInstagramCaption("a".repeat(2200))).toBeNull();
    expect(validateInstagramCaption("a".repeat(2201))).toMatch(/2200/);
    expect(validateInstagramCaption(Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" "))).toMatch(/30/);
  });

  it("eroarea 190 = conexiune expirată; limite și format clare", async () => {
    expect(classifyInstagramError({ error: { code: 190 } }).kind).toBe("expired");
    expect(classifyInstagramError({ error: { code: 9, error_subcode: 2207042, message: "limit" } }).igKind).toBe("limit");
    expect(classifyInstagramError({ error: { code: 36003, message: "aspect" } }).igKind).toBe("format");
    expect(classifyInstagramError({ error: { code: 100, error_subcode: 2207026, message: "video" } }).igKind).toBe("video");
    const f = async () => new Response(JSON.stringify({ error: { code: 190 } }), { status: 400 });
    await expect(
      publishToInstagram({ igUserId: "IG", token: "T", kind: "ig_photo", caption: "", media: { images: ["a"] } }, { fetch: f as unknown as typeof fetch }),
    ).rejects.toMatchObject({ kind: "expired", code: 190 });
  });
});
