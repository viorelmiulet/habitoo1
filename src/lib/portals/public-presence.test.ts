import { describe, expect, it } from "vitest";
import { hasPortalLogo } from "@/components/app/PortalLogo";
import { BLOG_SITE_URL, buildStaticSitemapXml } from "@/lib/blog-discovery";
import { homepagePortals, integrationPageBySlug, integrationSlugFor } from "./integration-pages";
import { INTEGRATION_OVERVIEW } from "./integration-overview";
import { PORTALS, PROMOTION_CATALOGS } from "./registry";

// Start from the registry, not the public lists: missing portals must remain test cases.
// Covered brands may share a detail page/card, but each needs its own homepage logo.
const available = [...PORTALS, ...PROMOTION_CATALOGS].filter((portal) => portal.status === "available");
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