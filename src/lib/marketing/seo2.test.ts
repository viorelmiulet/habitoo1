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
    expect(ld.inLanguage).toBe("ro");
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
