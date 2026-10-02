import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { agencyGridItems, agencyPortalCardState } from "./grid-state";

describe("grila portalurilor pentru administratorul agenției", () => {
  it("activat → Conectat, fără buton", () => {
    expect(agencyPortalCardState({ activated: true, request: { status: "pending", requestedAt: "2026-01-01", rejectionReason: null } }).key).toBe("connected");
  });
  it("neactivat fără cerere → Solicită activarea, activ", () => {
    expect(agencyPortalCardState({ activated: false, request: null })).toEqual({ key: "request", buttonLabel: "Solicită activarea", disabled: false });
  });
  it("cerere în așteptare → Cerere trimisă, dezactivat, cu data", () => {
    const s = agencyPortalCardState({ activated: false, request: { status: "pending", requestedAt: "2026-10-01T10:00:00Z", rejectionReason: null } });
    expect(s).toMatchObject({ key: "pending", buttonLabel: "Cerere trimisă", disabled: true, requestedAt: "2026-10-01T10:00:00Z" });
  });
  it("cerere respinsă → motiv și Solicită din nou", () => {
    const s = agencyPortalCardState({ activated: false, request: { status: "rejected", requestedAt: "x", rejectionReason: "Lipsă contract" } });
    expect(s).toMatchObject({ key: "rejected", buttonLabel: "Solicită din nou", disabled: false, reason: "Lipsă contract" });
  });
  it("doar portaluri disponibile, fiecare o dată", () => {
    const out = agencyGridItems([
      { id: "storia", availability: "available" },
      { id: "storia", availability: "available" },
      { id: "x", availability: "planned" },
    ]);
    expect(out.map((i) => i.id)).toEqual(["storia"]);
  });
  it("agentul obișnuit nu vede fila Portaluri", () => {
    const src = readFileSync("src/routes/_authenticated/app.settings.tsx", "utf8");
    expect(src).toMatch(/user\?\.isAdmin \? <TabsTrigger value="portals">/);
    expect(src).toMatch(/user\?\.isAdmin \? \(\s*<TabsContent value="portals">\s*<div[^>]*>\s*<AgencyPortalCatalogCard/);
  });
  it("cardurile nu au checkbox și nici chei/configurare", () => {
    const src = readFileSync("src/components/app/AgencyPortalCatalogCard.tsx", "utf8");
    expect(src).not.toMatch(/Checkbox|apiKey|credential|secret/i);
  });
});
