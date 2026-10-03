import { describe, expect, it } from "vitest";
import {
  derivePortalConnectionStatus,
  getPortalDefinition,
  integrationDisplayStatus,
  PORTAL_CONNECTION_LABEL,
  portalDisplayStatus,
} from "@/lib/portals/registry";

const def = (id: string) => getPortalDefinition(id)!;
const base = { externalAccountId: null, hasPortalCredential: false, lastError: null };

describe("statusul conexiunii: doar Conectat / Eroare / Deconectat", () => {
  it("are exact trei etichete", () => {
    expect(Object.keys(PORTAL_CONNECTION_LABEL).sort()).toEqual(["connected", "disconnected", "error"]);
    expect(JSON.stringify(PORTAL_CONNECTION_LABEL)).not.toContain("Pregătit");
  });

  it("regula comună", () => {
    expect(portalDisplayStatus({ activated: false, configured: true })).toBe("disconnected");
    expect(portalDisplayStatus({ activated: true, configured: false })).toBe("disconnected");
    expect(portalDisplayStatus({ activated: true, configured: true, lastError: "x" })).toBe("error");
    expect(portalDisplayStatus({ activated: true, configured: true })).toBe("connected");
  });

  it("ClickImob, Properstar, HomePitch: conectate prin simpla activare", () => {
    for (const id of ["clickimob", "properstar", "homepitch"]) {
      expect(derivePortalConnectionStatus({ ...base, definition: def(id), activated: true })).toBe("connected");
      expect(derivePortalConnectionStatus({ ...base, definition: def(id), activated: false })).toBe("disconnected");
    }
  });

  it("portal cu cheie: fără cheie Deconectat, cu cheie Conectat, cu eroare Eroare", () => {
    const d = def("primulanunt");
    expect(derivePortalConnectionStatus({ ...base, definition: d, activated: true })).toBe("disconnected");
    expect(derivePortalConnectionStatus({ ...base, definition: d, activated: true, hasPortalCredential: true })).toBe("connected");
    expect(
      derivePortalConnectionStatus({ ...base, definition: d, activated: true, hasPortalCredential: true, lastError: "401" }),
    ).toBe("error");
  });

  it("rând brut: ready activat devine Conectat", () => {
    expect(integrationDisplayStatus({ portal: "romimo", status: "ready", activated: true, lastError: null })).toBe("connected");
    expect(integrationDisplayStatus({ portal: "romimo", status: "not_configured", activated: true, lastError: null })).toBe("disconnected");
    expect(integrationDisplayStatus({ portal: "properstar", status: "ready", activated: true, lastError: null })).toBe("connected");
  });
});
