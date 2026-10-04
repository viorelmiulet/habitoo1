import { describe, expect, it } from "vitest";
import { buildSitemapXml, type DiscoverableBlogPost } from "@/lib/blog-discovery";

const base = { title: "Articol", excerpt: "Rezumat", updated_at: "2026-10-04T12:00:00.000Z" };

describe("sitemap blog", () => {
  it("include numai articole publicate, fără ciorne sau publicări viitoare", () => {
    const posts: DiscoverableBlogPost[] = [
      { ...base, slug: "publicat", status: "published", published_at: "2026-10-03T12:00:00.000Z" },
      { ...base, slug: "ciorna", status: "draft", published_at: null },
      { ...base, slug: "programat", status: "published", published_at: "2026-10-05T12:00:00.000Z" },
    ];
    const xml = buildSitemapXml(posts, new Date("2026-10-04T17:00:00.000Z"));
    expect(xml).toContain("https://www.habitoo.ro/blog/publicat");
    expect(xml).not.toContain("/blog/ciorna");
    expect(xml).not.toContain("/blog/programat");
  });
});