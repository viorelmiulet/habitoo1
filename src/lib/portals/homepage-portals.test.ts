import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { homepagePortals } from "./integration-pages";

const labels = homepagePortals().map((p) => p.label);
const ids = homepagePortals().map((p) => p.portal.id);

describe("homepage portals", () => {
  it("lists exactly the portals with a public integration page, in registry order", () => {
    expect(labels).toEqual([
      "ClickImob", "Imobli.ro", "Locuit.ro", "Imobiliare+", "iMove.ro", "Properstar", "La Cheie", "Imospot.ro", "imo24.ro", "ZonaTa.ro", "HomeDirect.ro", "Ofera.ro", "HomePitch.ro",
      "Imobiliare.ro", "Storia.ro + OLX.ro", "ZUP.ro", "OLX.ro (cont prepaid)", "OLX", "Publi24", "Publi24.ro + Romimo.ro", "Imopedia.ro", "PrimulAnunț.ro", "VDI.ro", "Catalog Facebook",

    ]);
  });
  it("includes the requested covered and catalog logos", () => {
    for (const id of ["olx_direct", "olx", "publi24", "facebook_catalog"]) {
      expect(ids).toContain(id);
    }
  });
  it("homepage FAQ mentions every portal in the grid", () => {
    const src = readFileSync("src/routes/index.tsx", "utf8");
    const answer = src.match(/Pe ce portaluri imobiliare pot publica[^\n]*\n\s*a: "([^"]+)"/)?.[1];
    if (!answer) throw new Error("Homepage portal FAQ is missing");
    const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f\s]/g, "").toLowerCase();
    const faq = norm(answer);
    for (const label of labels) {
      const faqLabel = label === "Catalog Facebook" ? "Catalogul Facebook" : label.replace(/ \(cont prepaid\)$/, "");
      for (const part of faqLabel.split(" + ")) expect(faq, label).toContain(norm(part.replace(/\.ro$/, "")));
    }
  });
});
