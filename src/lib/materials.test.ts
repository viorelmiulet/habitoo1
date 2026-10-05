import { describe, expect, it } from "vitest";
import {
  brandingFromOrg,
  buildPresentationHtml,
  presentationDescription,
  samplePresentation,
} from "./materials";

const branding = brandingFromOrg({
  name: "Agenția Test",
  phone: "021 555 0101",
  email: "office@example.ro",
});

describe("buildPresentationHtml", () => {
  it("include telefoanele agenției și agentului în fișa pentru client", () => {
    const html = buildPresentationHtml(branding, {
      ...samplePresentation,
      audience: "client",
      agent: { name: "Ana Agent", phone: "0722 000 111" },
    });

    expect(html).toContain("0722 000 111");
    expect(html).toContain("Ana Agent");
    expect(html).toContain('/assets/habitoo-logo.png');
    expect(html).toContain("Fișă generată cu Habitoo CRM");
    expect(html.match(/class="page /g)).toHaveLength(2);
  });

  it("elimină telefoanele din fișa pentru alt agent", () => {
    const html = buildPresentationHtml(branding, {
      ...samplePresentation,
      audience: "agent",
      agent: { name: "Ana Agent", phone: "0722 000 111" },
    });

    expect(html).not.toContain("021 555 0101");
    expect(html).not.toContain("0722 000 111");
    expect(html).toContain("office@example.ro");
    expect(html).toContain('/assets/habitoo-logo.png');
  });

  it("nu include originea, data adăugării sau identificatori interni", () => {
    const html = buildPresentationHtml(branding, {
      ...samplePresentation,
      specs: [
        { label: "Sursă", value: "immoflux" },
        { label: "Adăugat", value: "12.09.2026" },
        { label: "ID intern", value: "secret-id" },
        ...samplePresentation.specs,
      ],
    });

    expect(html).not.toContain("immoflux");
    expect(html).not.toContain("12.09.2026");
    expect(html).not.toContain("secret-id");
  });

  it("taie descrierea lungă numai la final de propoziție", () => {
    const long = `${"Primul paragraf este complet și clar. ".repeat(80)}Ultima propoziție nu încape.`;
    const result = presentationDescription(long);
    expect(result.length).toBeLessThanOrEqual(2_200);
    expect(result).toMatch(/[.!?]$/);
  });
});