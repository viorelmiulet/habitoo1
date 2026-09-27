/**
 * Linkul complet de feed, oferit la generarea cheii. Properstar nu mai are
 * link pe cheie de agenție (feedul se distribuie doar prin indexul protejat).
 */
import { describe, expect, it } from "vitest";
import { getPortalDefinition, portalPublicFeedUrl } from "@/lib/portals/registry";
import { generatePortalKey } from "@/lib/portals/keys.server";

describe("linkul de feed la generarea cheii", () => {
  it("Properstar nu mai primește link pe cheie de agenție", () => {
    const generated = generatePortalKey("properstar");
    expect(portalPublicFeedUrl("properstar", generated.key)).toBeNull();
  });

  it("un portal fără feed public nu primește URL", () => {
    expect(portalPublicFeedUrl("imobiliare_ro", "oarecare")).toBeNull();
    expect(portalPublicFeedUrl("portal-inexistent", "oarecare")).toBeNull();
    expect(getPortalDefinition("imobiliare_ro")?.public_feed_path_template).toBeUndefined();
  });
});
