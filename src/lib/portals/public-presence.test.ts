import { describe, expect, it } from "vitest";
import { hasPortalLogo } from "@/components/app/PortalLogo";
import { BLOG_SITE_URL, buildStaticSitemapXml } from "@/lib/blog-discovery";
import { homepagePortals, integrationPageBySlug, integrationSlugFor } from "./integration-pages";
import { INTEGRATION_OVERVIEW } from "./integration-overview";
import { PORTALS, PORTAL_GROUPS, PROMOTION_CATALOGS } from "./registry";

// Start from the registry, not the public lists: missing portals must remain test cases.
// Covered brands may share a detail page/card, but each needs its own homepage logo.
const availableIds = new Set([...PORTALS, ...PROMOTION_CATALOGS]
  .filter((portal) => portal.status === "available")
  .map((portal) => portal.id));
// OLX and Publi24 currently carry legacy coming_soon rows, but their available
// primary integration covers them; explicitly include those brands as requested.
const coveredIds = new Set(PORTAL_GROUPS
  .filter((group) => availableIds.has(group.primary))
  .flatMap((group) => group.covers));
const NOT_YET_PUBLIC = new Set(["vumsi"]);
const available = [...PORTALS, ...PROMOTION_CATALOGS]
  .filter((portal) => availableIds.has(portal.id) || coveredIds.has(portal.id))
  .filter((portal) => !NOT_YET_PUBLIC.has(portal.id));

describe("Vumsi is not public yet", () => {
  it("has no public page, card, homepage logo or sitemap URL", () => {
    expect(integrationSlugFor("vumsi")).toBeNull();
    expect(INTEGRATION_OVERVIEW.some((item) => item.logoIds.includes("vumsi"))).toBe(false);
    expect(homepageIds.has("vumsi")).toBe(false);
    expect(sitemap).not.toContain("vumsi");
  });
});
describe("Imobiliare+ is public", () => {
  it("has a public page, card, homepage logo and sitemap URL", () => {
    expect(integrationSlugFor("imobiliareplus")).toBe("imobiliareplus");
    expect(integrationPageBySlug("imobiliareplus")?.announcement).toBe("Lansare în curând: Imobiliare+ finalizează preluarea anunțurilor din Habitoo.");
    expect(INTEGRATION_OVERVIEW.some((item) => item.logoIds.includes("imobiliareplus"))).toBe(true);
    expect(homepageIds.has("imobiliareplus")).toBe(true);
    expect(sitemap).toContain(`<loc>${BLOG_SITE_URL}/integrari/imobiliareplus</loc>`);
  });
});
const homepageIds = new Set(homepagePortals().map(({ portal }) => portal.id));
const sitemap = buildStaticSitemapXml();

describe.each(available)("public presence: $display_name ($id)", (portal) => {
  it("has a public integration page, including shared pages for covered portals", () => {
    const slug = integrationSlugFor(portal.id);
    expect(slug, `${portal.id}: missing public integration slug`).not.toBeNull();
    expect(slug ? integrationPageBySlug(slug) : null, `${portal.id}: missing public detail page`).not.toBeNull();
  });

  it("has an integration card, including covered logos on shared cards", () => {
    const card = INTEGRATION_OVERVIEW.find((item) => item.logoIds.includes(portal.id));
    expect(card, `${portal.id}: missing integration card`).toBeDefined();
    expect(card?.slug).toBe(integrationSlugFor(portal.id));
  });

  it("has its logo included on the homepage, without catalog or covered-portal exemptions", () => {
    expect(homepageIds.has(portal.id), `${portal.id}: absent from homepage logo list`).toBe(true);
    expect(hasPortalLogo(portal.id), `${portal.id}: missing official logo asset`).toBe(true);
  });

  it("has its public integration URL in the sitemap", () => {
    const slug = integrationSlugFor(portal.id);
    expect(slug, `${portal.id}: cannot resolve sitemap URL`).not.toBeNull();
    expect(sitemap).toContain(`<loc>${BLOG_SITE_URL}/integrari/${slug}</loc>`);
  });
});