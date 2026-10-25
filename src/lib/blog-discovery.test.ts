import { describe, expect, it } from "vitest";
import { buildLlmsTxt, buildSitemapXml, type DiscoverableBlogPost } from "@/lib/blog-discovery";
import { PLAN_KEYS, PLAN_LABELS, PLAN_PRICES, planAgentLimitLabel } from "@/lib/plans";
import { INTEGRATION_PAGES } from "@/lib/portals/integration-pages";

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

describe("llms public", () => {
  const now = new Date("2026-10-25T20:12:00Z");
  const stats = { owner_sources: [{ source: "storia", count: 388 }, { source: "anuntul", count: 620 }, { source: "olx", count: 0 }], market_active: 8056 };
  const build = (partners = false) => buildLlmsTxt([], now, partners, stats);
  it("sums positive owner sources and reads the active market count", () => {
    expect(build()).toContain("1008 anunțuri active de la proprietari, din 2 surse: Storia.ro (388), Anuntul.ro (620)");
    expect(build()).toContain("8056 oferte de piață active");
  });
  it("uses the current Romanian calendar day rather than a fixed date", () => {
    expect(build()).toContain("La 25 octombrie 2026");
    expect(buildLlmsTxt([], new Date("2026-10-25T23:30:00Z"), false, stats)).toContain("La 26 octombrie 2026");
  });
  it.each(PLAN_KEYS)("keeps %s prices and seats synchronized with the price page", (key) => {
    const price = PLAN_PRICES[key];
    expect(build()).toContain(`${PLAN_LABELS[key]}: ${price.monthly} €/lună, ${planAgentLimitLabel(key)}`);
    expect(build()).toContain(`${price.annualMonthly * 12} €/an (${price.annualMonthly} €/lună équivalent)`.replace("équivalent", "echivalent"));
    expect((1 - price.annualMonthly / price.monthly) * 100).toBe(50);
  });
  it("lists only public published articles and eligible partners, never authors", () => {
    const posts = [
      { ...base, slug: "publicat", status: "published" as const, published_at: "2026-10-24T12:00:00Z", author_name: "Persoană Interzisă" },
      { ...base, slug: "ciorna", status: "draft" as const, published_at: null },
      { ...base, slug: "viitor", status: "published" as const, published_at: "2026-10-26T12:00:00Z" },
    ];
    const text = buildLlmsTxt(posts, now, true, stats);
    expect(text).toContain("/blog/publicat");
    expect(text).not.toContain("/blog/ciorna");
    expect(text).not.toContain("/blog/viitor");
    expect(text).not.toContain("Persoană Interzisă");
    expect(text).toContain("/agentii");
    expect(build()).not.toContain("/agentii");
    for (const portal of INTEGRATION_PAGES) expect(text).toContain(`/integrari/${portal.slug}`);
  });
});