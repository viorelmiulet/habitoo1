import { describe, expect, it } from "vitest";
import { INTEGRATION_OVERVIEW, integrationBadges, integrationItemListJsonLd } from "./integration-overview";
import { INTEGRATION_PAGES, integrationPageBySlug } from "./integration-pages";
import { getPortalDefinition, type PortalDefinition } from "./registry";
import { buildStaticSitemapXml } from "@/lib/blog-discovery";

describe("public integrations overview", () => {
  it("lists each integration and covered portal exactly once", () => {
    expect(INTEGRATION_OVERVIEW).toHaveLength(13);
    const ids = INTEGRATION_OVERVIEW.flatMap((p) => p.logoIds);
    expect(new Set(ids).size).toBe(ids.length);
    expect(INTEGRATION_OVERVIEW.find((p) => p.id === "storia")?.logoIds).toEqual(["storia", "olx"]);
    expect(INTEGRATION_OVERVIEW.find((p) => p.id === "romimo")?.logoIds).toEqual(["romimo", "publi24"]);
    expect(INTEGRATION_OVERVIEW.find((p) => p.id === "olx_direct")?.slug).toBe("olx");
  });
  it("every card resolves to an existing detail page", () => {
    for (const item of INTEGRATION_OVERVIEW) expect(integrationPageBySlug(item.slug)?.portalId).toBe(item.id);
    expect(new Set(INTEGRATION_OVERVIEW.map((p) => p.slug)).size).toBe(INTEGRATION_PAGES.length);
  });
  it("only implemented lead integrations advertise lead intake", () => {
    expect(INTEGRATION_OVERVIEW.filter((p) => p.badges.includes("Lead-uri în CRM")).map((p) => p.id).sort()).toEqual(["properstar", "storia", "vdi"]);
  });
  it("derives labels from changed capabilities rather than portal names", () => {
    const def = getPortalDefinition("storia");
    if (!def) throw new Error("missing Storia registry entry");
    const minimal: PortalDefinition = { ...def, capabilities: [], activation: "approval", receives_leads: false, withdraws_via_feed: false };
    expect(integrationBadges(minimal)).toEqual([]);
    expect(integrationBadges({ ...minimal, capabilities: ["publish_listing", "withdraw_listing"], receives_leads: true, activation: "self_service" })).toEqual(["Publicare directă", "Retragere automată", "Lead-uri în CRM", "Activezi singur"]);
    expect(integrationBadges({ ...minimal, capabilities: ["publish_listing", "feed_pull"] })).toEqual(["Preluare automată"]);
    expect(integrationBadges({ ...minimal, capabilities: ["feed_pull"], withdraws_via_feed: true })).toEqual(["Preluare automată", "Retragere automată"]);
  });
  it("feed portals are not presented as direct publication", () => {
    for (const id of ["clickimob", "imove", "homepitch", "properstar", "facebook_catalog"]) {
      const item = INTEGRATION_OVERVIEW.find((p) => p.id === id);
      expect(item?.badges).toContain("Preluare automată");
      expect(item?.badges).not.toContain("Publicare directă");
    }
  });
  it("groups Properstar and Catalog Facebook separately", () => {
    expect(INTEGRATION_OVERVIEW.filter((p) => p.section === "Portaluri internaționale").map((p) => p.id)).toEqual(["properstar"]);
    expect(INTEGRATION_OVERVIEW.filter((p) => p.section === "Reclame").map((p) => p.id)).toEqual(["facebook_catalog"]);
  });
  it("ItemList uses every existing detail URL once", () => {
    const list = integrationItemListJsonLd();
    expect(list.numberOfItems).toBe(13);
    expect(list.itemListElement.map((p) => p.url)).toEqual(INTEGRATION_OVERVIEW.map((p) => `https://www.habitoo.ro/integrari/${p.slug}`));
    expect(list.itemListElement.map((p) => p.position)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
  });
  it("sitemap dates only the updated overview", () => {
    expect(buildStaticSitemapXml()).toContain("<loc>https://www.habitoo.ro/integrari</loc>\n    <lastmod>2026-10-18</lastmod>");
    expect(buildStaticSitemapXml()).toContain("<loc>https://www.habitoo.ro/integrari/storia-olx</loc>\n    <lastmod>2026-10-10</lastmod>");
  });
});