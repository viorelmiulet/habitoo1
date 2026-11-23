import { describe, expect, it } from "vitest";
import { dynamicPortalDefinition, type DynamicFeedPortal } from "@/lib/dynamic-feed-portals";
import { buildDynamicIntegrationPage, dynamicIntegrationPages, integrationFeatures } from "@/lib/portals/integration-pages";
import { integrationJsonLd } from "@/lib/portals/integration-jsonld";
import { buildStaticSitemapXml } from "@/lib/blog-discovery";

const row = (slug: string, name: string, extra: Partial<DynamicFeedPortal> = {}): DynamicFeedPortal => ({
  slug, display_name: name, key_prefix: "hbxx_", website: `https://${name}/`, logo_path: `${slug}/00000000-0000-0000-0000-000000000000.svg`,
  xml_enabled: false, active: true, show_public: true, integration_mode: "api", ...extra,
});
const propri = dynamicPortalDefinition(row("propri-ro", "propri.ro"));
const cauta = dynamicPortalDefinition(row("cauta-ro", "cauta.ro"));
const hidden = dynamicPortalDefinition(row("ascuns-ro", "ascuns.ro", { show_public: false }));

describe("pagini de integrare pentru portalurile din SuperAdmin", () => {
  it("propri.ro și cauta.ro au pagină cu logo public, H1 și FAQPage plat", () => {
    for (const def of [propri, cauta]) {
      const page = buildDynamicIntegrationPage(def);
      expect(page.slug).toBe(def.id);
      expect(def.logo_url).toBe(`/api/public/feed/${def.id}/logo`);
      const faq = integrationJsonLd(page).find((n) => n["@type"] === "FAQPage") as { mainEntity: { "@type": string; acceptedAnswer: { text: string } }[] };
      expect(faq.mainEntity.length).toBeGreaterThan(0);
      for (const q of faq.mainEntity) { expect(q["@type"]).toBe("Question"); expect(typeof q.acceptedAnswer.text).toBe("string"); }
      expect(integrationJsonLd(page).some((n) => n["@type"] === "BreadcrumbList")).toBe(true);
    }
  });
  it("Partner API: doar ce face integrarea, fără cereri de la cumpărători, prețuri sau alte CRM-uri", () => {
    const page = buildDynamicIntegrationPage(propri);
    const text = [...page.intro, ...page.canDo, ...page.faq.flatMap((f) => [f.q, f.a])].join(" ");
    expect(text).toContain("Setări → Portaluri");
    expect(text).toMatch(/respins, cu motivul/);
    expect(text).toMatch(/scos de pe propri\.ro/);
    expect(text).not.toMatch(/lead|cereri|vizitator|statistic|€|lei|gratuit/i);
    expect(integrationFeatures(page).leads).toBe(false);
  });
  it("descrierea proprie din SuperAdmin are prioritate", () => {
    const page = buildDynamicIntegrationPage(dynamicPortalDefinition(row("propri-ro", "propri.ro", { public_description: "Text propriu despre propri.ro." })));
    expect(page.intro).toEqual(["Text propriu despre propri.ro."]);
  });
  it("fiecare portal public are pagină; cel cu show_public=false nu are și nu intră în sitemap", () => {
    const pages = dynamicIntegrationPages([propri, cauta, hidden]);
    expect(pages.map((p) => p.slug)).toEqual(["propri-ro", "cauta-ro"]);
    const xml = buildStaticSitemapXml(false, [], new Date(), [], pages);
    expect(xml).toContain("/integrari/propri-ro");
    expect(xml).toContain("/integrari/cauta-ro");
    expect(xml).not.toContain("/integrari/ascuns-ro");
  });
});
