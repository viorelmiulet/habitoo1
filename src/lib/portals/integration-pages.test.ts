import { describe, expect, it } from "vitest";
import { INTEGRATION_PAGES, INTEGRATION_PAGES_LASTMOD, integrationPageText, integrationSlugFor, wordCount } from "./integration-pages";
import { integrationJsonLd } from "./integration-jsonld";
import { buildStaticSitemapXml } from "@/lib/blog-discovery";

const SLUGS = ["storia", "olx", "imobiliare-ro", "publi24-romimo", "imospot", "vdi", "la-cheie", "primulanunt", "homepitch", "imove", "properstar", "clickimob", "catalog-facebook", "imo24", "zonata", "homedirect", "imopedia", "ofera", "zup", "imobli", "locuit", "bazaruldecase", "imobiliareplus", "vumsi", "housera"];

describe("pagini integrări", () => {
  it("câte o pagină pentru fiecare slug cerut", () => {
    expect(INTEGRATION_PAGES.map((p) => p.slug).sort()).toEqual([...SLUGS].sort());
    expect(integrationSlugFor("olx")).toBe("storia");
    expect(integrationSlugFor("publi24")).toBe("publi24-romimo");
  });
  it("Ofera are pagină publică și apare în sitemap", () => {
    expect(integrationSlugFor("ofera")).toBe("ofera");
    expect(buildStaticSitemapXml()).toContain("/integrari/ofera</loc>");
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
    expect(withLeads).toEqual(["housera", "properstar", "storia", "vdi"]);
  });
  it("sitemap conține paginile cu lastmod", () => {
    expect(INTEGRATION_PAGES_LASTMOD).toBe("2026-10-29");
    const xml = buildStaticSitemapXml();
    for (const s of SLUGS) expect(xml).toContain(`<loc>https://www.habitoo.ro/integrari/${s}</loc>\n    <lastmod>`);
  });
});

describe("număr portaluri pe /integrari", async () => {
  const { publicPortalCount, publicPortalIds } = await import("./integration-pages");
  const { readFileSync } = await import("node:fs");
  it("Catalogul Facebook nu intră; Publi24+Romimo două; OLX o dată", () => {
    const ids = publicPortalIds();
    expect(ids).not.toContain("facebook_catalog");
    expect(ids).toEqual(expect.arrayContaining(["romimo", "publi24", "olx"]));
    expect(ids.filter((i) => i.includes("olx"))).toEqual(["olx"]);
    expect(publicPortalCount()).toBe(25);
  });
  it("H1 folosește numărul calculat și fiecare pagină are link", async () => {
    const mod = await import("@/routes/integrari");
    expect(mod.H1).toBe(`Integrări cu ${publicPortalCount()} portaluri imobiliare din România`);
    const { INTEGRATION_OVERVIEW } = await import("./integration-overview");
    for (const p of INTEGRATION_PAGES) expect(INTEGRATION_OVERVIEW.some((o) => o.slug === p.slug)).toBe(true);
    const src = readFileSync("src/routes/integrari.tsx", "utf8");
    expect(src).toContain("<IntegrationsOverview />");
    expect(src).not.toMatch(/\b(API|OAuth|JSON|XML|feed)\b|lider|nr\. 1|cel mai bun/);
  });
});
