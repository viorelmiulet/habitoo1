import { describe, expect, it } from "vitest";
import { agenciesLabel, buildPortalCardsFrom, errorsPill, publishedLabel } from "./superadmin-portals";

describe("Secțiunea Portaluri", () => {
  it("exclude facebook_catalog și portalurile fără agenții; sortează erori, apoi publicate", () => {
    const r = buildPortalCardsFrom([
      { portal: "a", agencies: 1, published: 90, errors: 0 },
      { portal: "b", agencies: 2, published: 10, errors: 35 },
      { portal: "c", agencies: 1, published: 95, errors: 0 },
      { portal: "facebook_catalog", agencies: 3, published: 1, errors: 99 },
      { portal: "d", agencies: 0, published: 0, errors: 0 },
    ]);
    expect(r.map((x) => x.portal)).toEqual(["b", "c", "a"]);
  });

  it("etichete", () => {
    expect(agenciesLabel(1)).toBe("1 agenție");
    expect(agenciesLabel(3)).toBe("3 agenții");
    expect(publishedLabel({ portal: "x", agencies: 1, published: 0, errors: 0 })).toBe("fără publicări");
    expect(publishedLabel({ portal: "x", agencies: 1, published: 0, errors: 2 })).toBe("0 publicate");
    expect(errorsPill(1).text).toBe("1 eroare");
    expect(errorsPill(35)).toEqual({ text: "35 de erori", tone: "error" });
    expect(errorsPill(0)).toEqual({ text: "fără erori", tone: "ok" });
  });
});
