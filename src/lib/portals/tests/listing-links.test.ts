import { describe, expect, it } from "vitest";

import { portalListingLink, safeListingUrl } from "@/lib/portals/listing-links";

const base = { portalId: "imobiliare_ro", portalName: "Imobiliare.ro" };

describe("safeListingUrl", () => {
  it("acceptă URL https absolut", () => {
    expect(safeListingUrl("https://www.imobiliare.ro/anunt/123")).toBe(
      "https://www.imobiliare.ro/anunt/123",
    );
  });

  it("respinge http, javascript și valori invalide", () => {
    expect(safeListingUrl("http://exemplu.ro/anunt/1")).toBeNull();
    expect(safeListingUrl("javascript:alert(1)")).toBeNull();
    expect(safeListingUrl("nu-e-url")).toBeNull();
    expect(safeListingUrl("")).toBeNull();
    expect(safeListingUrl(null)).toBeNull();
  });
});

describe("portalListingLink", () => {
  it("publicat cu public_url → link cu tooltip „Vezi anunțul pe …”", () => {
    const link = portalListingLink({
      ...base,
      state: "published",
      publicUrl: "https://www.imobiliare.ro/anunt/ABC123",
    });
    expect(link.href).toBe("https://www.imobiliare.ro/anunt/ABC123");
    expect(link.tooltip).toBe("Vezi anunțul pe Imobiliare.ro");
  });

  it("in_feed cu public_url → link (feedurile cu link salvat)", () => {
    const link = portalListingLink({
      portalId: "homepitch",
      portalName: "HomePitch",
      state: "in_feed",
      publicUrl: "https://homepitch.ro/property/42",
    });
    expect(link.href).toBe("https://homepitch.ro/property/42");
  });

  it("publicat fără public_url → fără link, tooltip explicativ", () => {
    const link = portalListingLink({ ...base, state: "published", publicUrl: null });
    expect(link.href).toBeNull();
    expect(link.tooltip).toBe("Linkul anunțului nu este disponibil de la Imobiliare.ro");
  });

  it("ClickImob: fără link salvat rămâne neclicabil (formatul real nu e sigur)", () => {
    // Verificat pe clickimob.ro: /anunt/hb-1154 (doar ID-ul din feed) întoarce
    // „Anunț indisponibil”; slugul complet nu poate fi reconstruit sigur.
    const link = portalListingLink({
      portalId: "clickimob",
      portalName: "ClickImob",
      state: "in_feed",
      publicUrl: null,
    });
    expect(link.href).toBeNull();
    expect(link.tooltip).toBe("Linkul anunțului nu este disponibil de la ClickImob");
  });

  it("iMove / Properstar (feed-only, fără link public) rămân neclicabile", () => {
    for (const [portalId, portalName] of [
      ["imove", "iMove"],
      ["properstar", "Properstar"],
    ] as const) {
      const link = portalListingLink({ portalId, portalName, state: "in_feed", publicUrl: null });
      expect(link.href).toBeNull();
      expect(link.tooltip).toContain("nu este disponibil");
    }
  });

  it("stare nepublicată → fără link și fără tooltip (se păstrează eticheta de stare)", () => {
    for (const state of ["selected", "syncing", "error", "withdrawn", "not_selected"]) {
      const link = portalListingLink({
        ...base,
        state,
        publicUrl: "https://www.imobiliare.ro/anunt/ABC123",
      });
      expect(link.href).toBeNull();
      expect(link.tooltip).toBeNull();
    }
  });

  it("publicat cu URL nesigur → tratat ca lipsă", () => {
    const link = portalListingLink({ ...base, state: "published", publicUrl: "javascript:x" });
    expect(link.href).toBeNull();
    expect(link.tooltip).toBe("Linkul anunțului nu este disponibil de la Imobiliare.ro");
  });
});
