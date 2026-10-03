import { describe, expect, it } from "vitest";
import {
  configurablePortals,
  isPortalCovered,
  PORTALS,
  type PortalDefinition,
} from "@/lib/portals/registry";
import { portalGridState } from "@/lib/portals/grid-state";

/** Lista din grilă: portalurile configurabile care sunt disponibile. */
function gridPortals(): PortalDefinition[] {
  return configurablePortals().filter((p) => p.status === "available");
}

describe("grila de portaluri (Superadmin)", () => {
  it("conține doar portaluri cu integrare implementată", () => {
    const portals = gridPortals();
    expect(portals.length).toBeGreaterThan(0);
    for (const p of portals) {
      expect(p.status).toBe("available");
    }
  });

  it("afișează perechile o singură dată (Storia+OLX, Romimo+Publi24)", () => {
    const ids = gridPortals().map((p) => p.id);
    // Portalurile acoperite de o pereche nu apar separat în grilă.
    for (const p of PORTALS) {
      if (isPortalCovered(p.id)) {
        expect(ids, `${p.id} nu trebuie să apară separat în grilă`).not.toContain(p.id);
      }
    }
    // Fiecare portal configurabil apare exact o dată.
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id === "storia")).toHaveLength(1);
    expect(ids.filter((id) => id === "romimo")).toHaveLength(1);
  });

  it("afișează doar trei stări", () => {
    expect(portalGridState({ connectionStatus: "connected" })).toEqual({
      key: "connected",
      label: "Conectat",
      tone: "success",
    });
    expect(portalGridState({ connectionStatus: "error" })).toEqual({
      key: "error",
      label: "Eroare",
      tone: "danger",
    });
    expect(portalGridState({ connectionStatus: "disconnected" })).toEqual({
      key: "disconnected",
      label: "Deconectat",
      tone: "muted",
    });
  });
});
