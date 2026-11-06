import { describe, expect, it } from "vitest";
import { agenciesLabel, buildPortalCardsFrom, publishedLabel } from "./superadmin-portals";

const card = (portal: string, agencies: number, published: number, failingAgencies = 0, state: "ok" | "agencies" | "integration" = "ok") =>
  ({ portal, agencies, published, failingAgencies, state });

describe("Secțiunea Portaluri", () => {
  it("exclude facebook_catalog și portalurile fără agenții; integrarea căzută primul, apoi agenții cu eroare, apoi publicate", () => {
    const r = buildPortalCardsFrom([
      card("a", 1, 90),
      card("b", 2, 10, 1, "agencies"),
      card("c", 1, 95),
      card("e", 2, 0, 2, "integration"),
      card("facebook_catalog", 3, 1, 3, "integration"),
      card("d", 0, 0),
    ]);
    expect(r.map((x) => x.portal)).toEqual(["e", "b", "c", "a"]);
  });

  it("etichete", () => {
    expect(agenciesLabel(1)).toBe("1 agenție");
    expect(agenciesLabel(3)).toBe("3 agenții");
    expect(publishedLabel(card("x", 1, 0))).toBe("fără publicări");
    expect(publishedLabel(card("x", 1, 25))).toBe("25 de publicate");
  });
});
