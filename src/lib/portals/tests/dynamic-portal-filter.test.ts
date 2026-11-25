import { describe, expect, it } from "vitest";
import { z } from "zod";
import { withFeedDefinitions } from "@/lib/feed-registry-scope.server";
import { STATIC_PORTALS, type PortalDefinition } from "@/lib/portals/registry";
import { applyPortalFeedback, matchesPortalFilter, parsePortalFilter, PORTAL_ID_PATTERN, type PortalSelectionState } from "@/lib/portals/portal-state";
import { matchingPropertyIds, parsePromotionSelection, promotionFilterGroups, promotionFilterLabel, rejectedFeedbackErrorRows, togglePromotionValue } from "@/lib/portals/promotion-filter";

const base = STATIC_PORTALS[0] as PortalDefinition;
const dyn = (id: string, name: string): PortalDefinition => ({ ...base, id, display_name: name, status: "available", capabilities: ["feed_pull"], dynamic_feed: true, supports_promoted_flag: false });
const defs = [dyn("propri-ro", "propri.ro"), dyn("cauta-ro", "cauta.ro")];
const values = z.array(z.string().regex(new RegExp(`^(any|none|imobiliare_ro:[a-z0-9_]+|${PORTAL_ID_PATTERN}:(promoted|published|unpublished|error)|storia:(auto_renew_(on|off)|expired))$`)));
const single = z.string().regex(new RegExp(`^(${PORTAL_ID_PATTERN}|any)$`));

const cell = (portalId: string, derived: PortalSelectionState, feedback: string | null) => ({ portalId, state: applyPortalFeedback(derived, feedback) });
const rejected = [cell("propri-ro", "in_feed", "rejected")];
const published = [cell("propri-ro", "in_feed", "published")];

describe("filtrul Portaluri pentru portalurile dinamice", () => {
  it("propri-ro:error, cauta-ro:published și any:error trec validarea", () => {
    expect(values.safeParse(["propri-ro:error", "cauta-ro:published", "any:error"]).success).toBe(true);
    expect(single.safeParse("propri-ro").success).toBe(true);
    expect(parsePortalFilter("propri-ro:error")).toEqual({ portal: "propri-ro", state: "error" });
    expect(parsePortalFilter("cauta-ro:published")).toEqual({ portal: "cauta-ro", state: "published" });
  });
  it("răspunsul portalului se aplică la fel ca pe card", () => {
    expect(applyPortalFeedback("in_feed", "rejected")).toBe("error");
    expect(applyPortalFeedback("not_selected", "published")).toBe("published");
    expect(applyPortalFeedback("in_feed", "pending_review")).toBe("syncing");
    expect(applyPortalFeedback("in_feed", null)).toBe("in_feed");
  });
  it("anunțul respins apare la propri-ro:error și any:error, nu la propri-ro:published", () => {
    expect(matchesPortalFilter(rejected, { portal: "propri-ro", state: "error" })).toBe(true);
    expect(matchesPortalFilter(rejected, { portal: "any", state: "error" })).toBe(true);
    expect(matchesPortalFilter(rejected, { portal: "propri-ro", state: "published" })).toBe(false);
    expect(matchesPortalFilter(published, { portal: "propri-ro", state: "published" })).toBe(true);
  });
  it("calea „Cu erori” include respinsele, fără să schimbe celelalte erori", () => {
    withFeedDefinitions(defs, () => {
      const errors = [
        { property_id: "a", portal_key: "imospot", enabled: true, status: "error" },
        ...rejectedFeedbackErrorRows([
          { property_id: "r", portal: "propri-ro", status: "rejected" },
          { property_id: "p", portal: "propri-ro", status: "published" },
        ]),
      ];
      const run = (raw: string) => matchingPropertyIds(parsePromotionSelection(raw), new Map(), new Map(), errors, []);
      expect(run("propri-ro:error")).toEqual(["r"]);
      expect(run("imospot:error,propri-ro:error").sort()).toEqual(["a", "r"]);
      expect(run("imospot:error")).toEqual(["a"]);
    });
  });
  it("comutarea și eticheta filtrului activ", () => {
    withFeedDefinitions(defs, () => {
      expect(togglePromotionValue(["none"], "propri-ro:error")).toEqual(["none", "propri-ro:error"]);
      const groups = promotionFilterGroups(new Set(["propri-ro", "cauta-ro"]));
      expect(promotionFilterLabel("propri-ro:error", groups)).toBe("Erori · propri.ro");
    });
  });
});
