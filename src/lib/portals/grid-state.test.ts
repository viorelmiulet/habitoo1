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

  it("derivă corect starea afișată pe card", () => {
    // Conectat (punct verde), indiferent de cererile vechi.
    expect(portalGridState({ connectionStatus: "connected" })).toEqual({
      key: "connected",
      label: "Conectat",
      tone: "success",
    });
    expect(
      portalGridState({ connectionStatus: "connected", requestStatus: "rejected" }).label,
    ).toBe("Conectat");

    // Pregătit pentru conectare (punct galben).
    expect(portalGridState({ connectionStatus: "ready" })).toEqual({
      key: "ready",
      label: "Pregătit pentru conectare",
      tone: "warning",
    });

    // Cererile de activare au prioritate în fața stării neutre.
    expect(
      portalGridState({ connectionStatus: "not_configured", requestStatus: "pending" }),
    ).toEqual({
      key: "pending_request",
      label: "Cerere de activare în așteptare",
      tone: "warning",
    });
    expect(
      portalGridState({ connectionStatus: "not_configured", requestStatus: "rejected" }),
    ).toEqual({
      key: "rejected_request",
      label: "Cerere respinsă",
      tone: "danger",
    });

    // Fără conexiune și fără cereri: neactivat.
    expect(portalGridState({ connectionStatus: "not_configured" })).toEqual({
      key: "inactive",
      label: "Neactivat",
      tone: "muted",
    });
    expect(portalGridState({ connectionStatus: "disconnected" }).label).toBe("Neactivat");

    // O eroare de conexiune nu se ascunde.
    expect(portalGridState({ connectionStatus: "error" })).toEqual({
      key: "error",
      label: "Eroare de conexiune",
      tone: "danger",
    });
  });
});
