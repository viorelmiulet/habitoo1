import { describe, expect, it } from "vitest";
import { blogFaqJsonLd, blogPostingJsonLd, withHeadingAnchors } from "./blog-aeo";
import { indexNowKeyResponse } from "./indexnow-key";
import { changedRevisions } from "./indexnow";

const post = { slug: "ghid", title: "Ghid", published_at: "2026-01-01T00:00:00Z", updated_at: "2026-02-01T00:00:00Z" };
describe("SEO2", () => {
  it("article JSON-LD has Echipa Habitoo author and dateModified", () => {
    const ld = blogPostingJsonLd(post, { description: "d", words: 10 });
    expect(ld.author).toEqual({ "@type": "Organization", name: "Echipa Habitoo", url: "https://www.habitoo.ro/despre", parentOrganization: { "@id": "https://www.habitoo.ro/#organization" } });
    expect(ld.dateModified).toBe("2026-02-01T00:00:00Z");
    expect(ld.inLanguage).toBe("ro-RO");
  });
  it("table of contents only with at least 3 H2", () => {
    expect(withHeadingAnchors("<h2>A</h2><h2>B</h2>").toc).toEqual([]);
    const r = withHeadingAnchors("<h2>Unu</h2><p>x</p><h2>Doi</h2><h2>Trei</h2>");
    expect(r.toc.map((t) => t.id)).toEqual(["unu", "doi", "trei"]);
    expect(r.html).toContain('<h2 id="doi">');
  });
  it("article FAQ emits FAQPage", () => {
    expect(blogFaqJsonLd("ghid", [])).toBeNull();
    const ld = blogFaqJsonLd("ghid", [{ q: "Ce?", a: "Asta." }])!;
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity[0]).toEqual({ "@type": "Question", name: "Ce?", acceptedAnswer: { "@type": "Answer", text: "Asta." } });
  });
  it("IndexNow key file: 200 only for the right name, 404 otherwise", async () => {
    const key = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
    const ok = indexNowKeyResponse(`/${key}.txt`, key)!;
    expect(ok.status).toBe(200); expect(await ok.text()).toBe(key);
    expect(indexNowKeyResponse(`/${"f".repeat(32)}.txt`, key)!.status).toBe(404);
    expect(indexNowKeyResponse("/robots.txt", key)).toBeNull();
  });
  it("IndexNow batch has only changed URLs", () => {
    const current = [{ url: "https://www.habitoo.ro/blog/a", revision: "2" }, { url: "https://www.habitoo.ro/blog/b", revision: "1" }, { url: "https://www.habitoo.ro/blog/a", revision: "2" }];
    expect(changedRevisions(current, [{ url: "https://www.habitoo.ro/blog/b", revision: "1" }, { url: "https://www.habitoo.ro/blog/a", revision: "1" }]).map((c) => c.url)).toEqual(["https://www.habitoo.ro/blog/a"]);
  });
});

import { blogBreadcrumbJsonLd, blogByline, relatedPosts } from "./blog-aeo";
import { notifyIndexNow } from "./indexnow.server";

function fakeDb(sent: { url: string; revision: string }[]) {
  const upserts: unknown[] = [];
  const db = {
    rpc: async () => ({ data: true, error: null }),
    from: () => ({ select: () => ({ in: async () => ({ data: sent, error: null }) }), upsert: async (rows: unknown) => { upserts.push(rows); return {}; }, update: () => ({ eq: async () => ({}) }) }),
  };
  return { db, upserts };
}
describe("SEO2 extra", () => {
  it("byline shows Actualizat only when the day differs", () => {
    expect(blogByline("2026-01-01T10:00:00Z", "2026-01-01T12:00:00Z")).toBe("de Echipa Habitoo · Publicat 1 ianuarie 2026");
    expect(blogByline("2026-01-01T10:00:00Z", "2026-02-03T10:00:00Z")).toBe("de Echipa Habitoo · Publicat 1 ianuarie 2026 · Actualizat 3 februarie 2026");
  });
  it("breadcrumb Acasă › Blog › articol", () => {
    expect(blogBreadcrumbJsonLd({ slug: "ghid", title: "Ghid" }).itemListElement.map((i) => i.name)).toEqual(["Acasă", "Blog", "Ghid"]);
  });
  it("BlogPosting inLanguage ro-RO and publisher logo", () => {
    const ld = blogPostingJsonLd(post, { description: "d", words: 3, image: "https://x/i.png" });
    expect(ld.inLanguage).toBe("ro-RO"); expect(ld.publisher.logo.url).toBe("https://www.habitoo.ro/assets/habitoo-logo.png"); expect(ld.wordCount).toBe(3);
  });
  it("related: category first, then recent", () => {
    const p = { id: "0", title: "t", category: "A" };
    const list = [{ id: "1", title: "x", category: "B" }, { id: "2", title: "y", category: "A" }, { id: "3", title: "z", category: "B" }, { id: "4", title: "w", category: "B" }];
    expect(relatedPosts(p, list).map((x) => x.id)).toEqual(["2", "1", "3"]);
  });
  it("key file only on www.habitoo.ro", () => {
    expect(indexNowKeyResponse("/abcdefgh12345678.txt", "abcdefgh12345678", "crm.habitoo.ro")).toBeNull();
  });
  it("sends only changed URLs with keyLocation, no send when nothing changed", async () => {
    const calls: { body: string }[] = [];
    const send = (async (_u: string, init: { body: string }) => { calls.push(init); return new Response(null, { status: 202 }); }) as unknown as typeof fetch;
    const { db, upserts } = fakeDb([{ url: "https://www.habitoo.ro/blog/b", revision: "1" }]);
    await notifyIndexNow([{ url: "https://www.habitoo.ro/blog/a", revision: "2" }, { url: "https://www.habitoo.ro/blog/b", revision: "1" }], { key: "k".repeat(32), db, send });
    const body = JSON.parse(calls[0].body);
    expect(body.urlList).toEqual(["https://www.habitoo.ro/blog/a"]);
    expect(body.keyLocation).toBe(`https://www.habitoo.ro/${"k".repeat(32)}.txt`);
    expect(upserts).toHaveLength(1);
    const again = fakeDb([{ url: "https://www.habitoo.ro/blog/a", revision: "2" }]);
    await notifyIndexNow([{ url: "https://www.habitoo.ro/blog/a", revision: "2" }], { key: "k".repeat(32), db: again.db, send });
    expect(calls).toHaveLength(1);
  });
  it("send errors are swallowed", async () => {
    const { db } = fakeDb([]);
    await expect(notifyIndexNow([{ url: "https://www.habitoo.ro/blog/a", revision: "1" }], { key: "k".repeat(32), db, send: (async () => { throw new Error("x"); }) as unknown as typeof fetch })).resolves.toBeUndefined();
  });
});
