import { describe, expect, it } from "vitest";
import { BLOG_ARTICLES_2026_11 as ARTICLES, LEGAL_NOTE } from "@/lib/marketing/blog-articles-2026-11";
import { staticContentRevisions } from "@/lib/marketing/indexnow";

const BASE = "http://localhost:8080";
const BANNED = ["immoflux", "rebs", "crmrebs", "realvia", "hubspot", "salesforce", "zoho", "pipedrive", "imoeasy", "bitrix", "monday.com", "propertybase", "kvcore", "follow up boss", "agentimage"];
const graph = (html: string): Record<string, unknown>[] => [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)]
  .map((m) => JSON.parse(m[1] ?? "{}")).flatMap((b) => (Array.isArray(b["@graph"]) ? b["@graph"] : [b]));
const words = (s: string) => s.replace(/[#*>[\]()]/g, " ").split(/\s+/).filter(Boolean).length;

describe("articolele de blog din 21 noiembrie 2026", () => {
  it("sunt 6, cu reguli SEO, lungime, FAQ, linkuri interne și notă juridică doar pe 2 și 3", () => {
    expect(ARTICLES).toHaveLength(6);
    ARTICLES.forEach((a, i) => {
      expect(a.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(a.seo_title.length).toBeLessThan(60);
      expect(a.seo_description.length).toBeGreaterThanOrEqual(140);
      expect(a.seo_description.length).toBeLessThanOrEqual(160);
      expect(a.faq.length).toBeGreaterThanOrEqual(4);
      expect(a.faq.length).toBeLessThanOrEqual(5);
      const w = words(a.content + " " + a.faq.map((f) => `${f.q} ${f.a}`).join(" "));
      expect(w, a.slug).toBeGreaterThanOrEqual(1200);
      expect(w, a.slug).toBeLessThanOrEqual(1800);
      const siblings = ARTICLES.filter((o) => o.slug !== a.slug && a.content.includes(`/blog/${o.slug})`)).length;
      expect(siblings, a.slug).toBeGreaterThanOrEqual(2);
      expect(siblings, a.slug).toBeLessThanOrEqual(3);
      expect(a.content.includes(LEGAL_NOTE)).toBe(i === 1 || i === 2);
      expect(a.content).not.toMatch(/^#\s/m);
    });
  });

  it("nu conțin nume de alte CRM-uri", () => {
    for (const a of ARTICLES) { const text = JSON.stringify(a).toLowerCase(); for (const n of BANNED) expect(text, `${a.slug}: ${n}`).not.toContain(n); }
  });

  it("intră în trimiterea IndexNow pentru paginile publice", () => {
    const urls = staticContentRevisions().map((r) => r.url);
    for (const a of ARTICLES) expect(urls).toContain(`https://www.habitoo.ro/blog/${a.slug}`);
  });

  for (const [i, a] of ARTICLES.entries()) {
    it(`${a.slug}: un H1, canonical, FAQPage plat, autor Echipa Habitoo`, async () => {
      const res = await fetch(`${BASE}/blog/${a.slug}`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
      expect(html).toMatch(new RegExp(`<link[^>]*rel="canonical"[^>]*href="https://www\\.habitoo\\.ro/blog/${a.slug}"`));
      const nodes = graph(html);
      for (const n of nodes) { expect(Array.isArray(n)).toBe(false); expect(typeof n["@type"]).toBe("string"); }
      const post = nodes.find((n) => n["@type"] === "BlogPosting") as { author: { "@type": string; name: string }; datePublished: string } | undefined;
      expect(post?.author).toMatchObject({ "@type": "Organization", name: "Echipa Habitoo" });
      expect(post?.datePublished.slice(0, 10)).toBe("2026-11-21");
      const faq = nodes.find((n) => n["@type"] === "FAQPage") as { mainEntity: unknown[] } | undefined;
      expect(faq?.mainEntity).toHaveLength(a.faq.length);
      expect(nodes.some((n) => n["@type"] === "BreadcrumbList")).toBe(true);
      expect(/<blockquote>[\s\S]{0,300}?nu reprezintă consultanță juridică/.test(html)).toBe(i === 1 || i === 2);
      const lower = html.toLowerCase(); for (const n of BANNED) expect(lower, n).not.toContain(n);
    }, 15000);
  }

  it("apar în sitemap-blog.xml și în llms.txt / llms-full.txt", async () => {
    const [sitemap, llms, full] = await Promise.all(["/sitemap-blog.xml", "/llms.txt", "/llms-full.txt"].map(async (p) => (await fetch(`${BASE}${p}`)).text()));
    for (const a of ARTICLES) {
      expect(sitemap).toContain(`https://www.habitoo.ro/blog/${a.slug}<`);
      expect(llms).toContain(`https://www.habitoo.ro/blog/${a.slug}`);
      expect(full).toContain(`https://www.habitoo.ro/blog/${a.slug}`);
    }
  }, 20000);
});
