import { describe, expect, it } from "vitest";
import { buildPresentationHtml, brandingFromOrg, samplePresentation } from "./materials";
import { PROPERTY_SHEET_TEMPLATES, preferredSheetTemplate } from "./property-sheet-templates";

const branding = brandingFromOrg({ name: "Agenția Ștefan", phone: "021 555 0101" });
for (const { id } of PROPERTY_SHEET_TEMPLATES) describe(id, () => {
  for (const audience of ["client", "agent"] as const) it(`confidențialitate ${audience}`, () => {
    const html = buildPresentationHtml(branding, { ...samplePresentation, template: id, audience,
      agent: { name: "Ana Țincă", phone: "0722 000 111" },
      specs: [...samplePresentation.specs, { label: "Sursă", value: "secret-origin" }, { label: "Data adăugării", value: "15.10.2026" }] });
    expect(html.includes("0722 000 111")).toBe(audience === "client");
    if (audience === "agent") expect(html).not.toContain("021 555 0101");
    expect(html).not.toContain("secret-origin"); expect(html).not.toContain("15.10.2026");
  });
  it("păstrează descrierea lungă integral", () => {
    const description = "Ștefan și Țincă vă prezintă locuința.\n\n".repeat(100) + "Sfârșit verificabil.";
    const html = buildPresentationHtml(branding, { ...samplePresentation, template: id, description });
    expect(html).toContain("Sfârșit verificabil.");
    expect(html.match(/Ștefan și Țincă/g)).toHaveLength(100);
  });
  it("nu adaugă pagina de descriere când lipsește", () => {
    expect(buildPresentationHtml(branding, { ...samplePresentation, template: id, description: null })).not.toContain("data-sheet-description-page");
  });
  it("acceptă zero fotografii", () => {
    expect(buildPresentationHtml(branding, { ...samplePresentation, template: id, photos: [] })).toContain("Fotografie indisponibilă");
  });
  it("limitează fotografiile afișate fără a le reordona", () => {
    const photos = Array.from({ length: 15 }, (_, i) => `https://example.test/photo-${i}.jpg`);
    const html = buildPresentationHtml(branding, { ...samplePresentation, template: id, photos });
    expect(html).toContain(photos[0]); expect(html).not.toContain(photos[14]);
    if (id === "gallery") expect(html).toContain(photos[8]);
  });
});
it("preferința utilizatorului prevalează, apoi agenția, apoi Clasic", () => {
  expect(preferredSheetTemplate("minimal", "elegant")).toBe("minimal");
  expect(preferredSheetTemplate(null, "elegant")).toBe("elegant");
  expect(preferredSheetTemplate("invalid", null)).toBe("classic");
});