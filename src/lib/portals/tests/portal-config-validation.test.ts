import { describe, expect, it } from "vitest";

import { PORTALS, validatePortalConfigValues } from "../registry";

describe("validarea formatelor declarate în configurarea portalurilor", () => {
  it("respinge un email de cont Romimo invalid, cu eticheta câmpului", () => {
    const error = validatePortalConfigValues("romimo", {
      externalAccountId: "agentie.exemplu",
      credential: "api-key",
    });
    expect(error).toContain("Email cont Romimo");
    expect(error).toContain("email");
  });

  it("acceptă un email valid", () => {
    expect(
      validatePortalConfigValues("romimo", {
        externalAccountId: "agentie@exemplu.ro",
        credential: "api-key",
      }),
    ).toBeNull();
  });

  it("nu validează câmpul necompletat (lipsa se semnalează la conectare)", () => {
    expect(validatePortalConfigValues("romimo", { externalAccountId: "  " })).toBeNull();
    expect(validatePortalConfigValues("romimo", {})).toBeNull();
  });

  it("nu afectează portalurile fără formate declarate", () => {
    for (const portal of PORTALS) {
      if (portal.configuration_schema.fields.some((field) => field.validate)) continue;
      expect(
        validatePortalConfigValues(portal.id, {
          externalAccountId: "orice",
          credential: "orice",
          endpointUrl: "orice",
        }),
      ).toBeNull();
    }
  });
});
