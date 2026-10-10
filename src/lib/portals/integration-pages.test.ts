import { describe, expect, it } from "vitest";
import { INTEGRATION_PAGES, integrationPageText, integrationSlugFor, wordCount } from "./integration-pages";
import { integrationJsonLd } from "./integration-jsonld";
import { buildStaticSitemapXml } from "@/lib/blog-discovery";

const SLUGS = ["storia-olx", "olx", "imobiliare-ro", "publi24-romimo", "imospot", "vdi", "la-cheie", "oferte-imobiliare", "primulanunt", "homepitch", "imove", "properstar", "clickimob", "catalog-facebook"];

describe("pagini integrări", () => {
  it("câte o pagină pentru fiecare slug cerut", () => {
    expect(INTEGRATION_PAGES.map((p) => p.slug).sort()).toEqual([...SLUGS].sort());
    expect(integrationSlugFor("olx")).toBe("storia-olx");
    expect(integrationSlugFor("publi24")).toBe("publi24-romimo");
  });
  it.each(INTEGRATION_PAGES.map((p) => [p.slug, p] as const))("%s: titlu, descriere, cuvinte, FAQ", (_s, p) => {
    expect(p.title.length).toBeLessThanOrEqual(60);
    expect(p.description.length).toBeGreaterThanOrEqual(140);
    expect(p.description.length).toBeLessThanOrEqual(158);
    const n = wordCount(integrationPageText(p));
    expect(n).toBeGreaterThanOrEqual(400);
    expect(n).toBeLessThanOrEqual(600);
    expect(p.faq.length).toBeGreaterThanOrEqual(3);
    expect(p.faq.length).toBeLessThanOrEqual(4);
    expect(p.notes.length).toBeLessThanOrEqual(4);
    expect(integrationPageText(p) + p.description).not.toMatch(/\b(API|endpoint|OAuth|JSON|XML|feed)\b/i);
    expect(integrationJsonLd(p).map((x) => x["@type"])).toEqual(["WebPage", "BreadcrumbList", "FAQPage"]);
  });
  it("lead-urile apar doar unde Habitoo le preia", () => {
    const withLeads = INTEGRATION_PAGES.filter((p) => p.canDo.some((t) => t.includes("lead"))).map((p) => p.portalId).sort();
    expect(withLeads).toEqual(["properstar", "storia", "vdi"]);
  });
  it("sitemap conține paginile cu lastmod", () => {
    const xml = buildStaticSitemapXml();
    for (const s of SLUGS) expect(xml).toContain(`<loc>https://www.habitoo.ro/integrari/${s}</loc>\n    <lastmod>`);
  });
});
