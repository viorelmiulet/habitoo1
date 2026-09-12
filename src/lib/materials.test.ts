import { describe, expect, it } from "vitest";
import { brandingFromOrg, buildPresentationHtml, samplePresentation } from "./materials";

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

    expect(html).toContain("Agenție: 021 555 0101");
    expect(html).toContain("Agent: Ana Agent · 0722 000 111");
    expect(html).toContain('/assets/habitoo-logo.png');
    expect(html).toContain("Generat cu Habitoo CRM");
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
});