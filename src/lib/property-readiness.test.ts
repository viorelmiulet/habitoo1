import { describe, expect, it } from "vitest";
import { computePropertyIssues, type ReadinessInput } from "./property-readiness";

const ready: ReadinessInput = {
  description: "Descriere completă. ".repeat(100), imageCount: 5,
  lat: 44.4, lng: 26.1, price: 100000, salePrice: null, rentPrice: null,
  city: "București", address: null, publishStatus: "published",
  createdAt: new Date().toISOString(), publications: [],
};
const publication = (portalKey: string, status = "error", enabled = true) => ({ portalKey, status, enabled });
const issuesFor = (...publications: ReadinessInput["publications"]) => computePropertyIssues({ ...ready, publications });

describe("property-readiness — probleme portaluri", () => {
  it("respingerile folosesc numele HomeDirect.ro din registry", () => {
    expect(issuesFor(publication("homedirect"))).toEqual([
      { code: "portal_rejected", label: "Respins de HomeDirect.ro", severity: "danger" },
    ]);
  });
  it.each(["withdrawn", "disabled"])("retragerile %s folosesc numele din registry", (status) => {
    expect(issuesFor(publication("imobiliareplus", status))).toEqual([
      { code: "portal_withdrawn", label: "Retrasă de pe Imobiliare+", severity: "warning" },
    ]);
  });
  it.each([
    ["imobli", "Imobli.ro"], ["clickimob", "ClickImob"], ["locuit", "Locuit.ro"],
    ["bazaruldecase", "BazarulDeCase.ro"], ["imobiliareplus", "Imobiliare+"],
  ])("portalul cu preluare automată %s nu este prezentat ca respingere", (key, name) => {
    expect(issuesFor(publication(key))).toEqual([
      { code: "portal_rejected", label: `Nu apare pe ${name}`, severity: "danger" },
    ]);
  });
  it("exact două portaluri cu eroare păstrează două probleme", () => {
    expect(issuesFor(publication("homedirect"), publication("imobiliareplus"))).toHaveLength(2);
  });
  it("trei portaluri cu eroare produc o singură problemă", () => {
    expect(issuesFor(publication("homedirect"), publication("clickimob"), publication("imobli"))).toEqual([
      { code: "portal_rejected", label: "Nu se poate publica pe 3 portaluri – verifică datele anunțului", severity: "danger" },
    ]);
  });
  it("numără portaluri distincte, nu publicări duplicate", () => {
    expect(issuesFor(publication("homedirect"), publication("homedirect"), publication("clickimob"), publication("imobli"))).toEqual([
      { code: "portal_rejected", label: "Nu se poate publica pe 3 portaluri – verifică datele anunțului", severity: "danger" },
    ]);
  });
  it("portalurile debifate, retrase și publicate nu cresc numărul erorilor", () => {
    const issues = issuesFor(publication("homedirect"), publication("clickimob"), publication("imobli", "error", false), publication("locuit", "published"), publication("imobiliareplus", "withdrawn"));
    expect(issues.filter((issue) => issue.code === "portal_rejected")).toHaveLength(2);
    expect(issues.filter((issue) => issue.code === "portal_withdrawn")).toHaveLength(1);
  });
  it("gruparea păstrează celelalte probleme ale anunțului", () => {
    const issues = computePropertyIssues({ ...ready, imageCount: 0, publications: [publication("homedirect"), publication("clickimob"), publication("imobli"), publication("locuit", "withdrawn")] });
    expect(issues.map((issue) => issue.code)).toEqual(["no_images", "portal_withdrawn", "portal_rejected"]);
  });
});