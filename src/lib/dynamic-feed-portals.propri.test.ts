import { describe, expect, it } from "vitest";
import { dynamicFeedPortalSchema, dynamicPortalDefinition } from "./dynamic-feed-portals";

const PROPRI = { slug: "propri-ro", display_name: "propri.ro", key_prefix: "hbpr_", website: "https://propri.ro/", logo_path: "propri-ro/6c91aa5d-208c-4dad-bdd3-29d40edaed12.svg", xml_enabled: false, active: true, show_public: false, integration_mode: "api" };

describe("logo propri.ro", () => {
  it("registrul întoarce logoul propri.ro", () => {
    const d = dynamicPortalDefinition(PROPRI);
    expect(d.display_name).toBe("propri.ro");
    expect(d.logo_url).toBe("/api/public/feed/propri-ro/logo");
  });
  it("calea SVG a logoului este acceptată la salvarea din SuperAdmin", () => {
    const r = dynamicFeedPortalSchema.safeParse({ slug: PROPRI.slug, display_name: PROPRI.display_name, website: PROPRI.website, logo_path: PROPRI.logo_path });
    expect(r.success).toBe(true);
  });
});
