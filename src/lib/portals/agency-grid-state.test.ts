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

  it("afișează doar portalurile, fără Colaborare Habitoo", () => {
    const src = readFileSync("src/components/app/AgencyPortalCatalogCard.tsx", "utf8");
    expect(src).not.toContain("Colaborare Habitoo");
    expect(src).toContain("Cere activarea portalurilor de care ai nevoie. Le activează echipa Habitoo.");
  });

  it("La Cheie folosește același card și nu afișează panoul de retrimitere", () => {
    const catalog = readFileSync("src/components/app/AgencyPortalCatalogCard.tsx", "utf8");
    const laCheie = readFileSync("src/components/app/LaCheieActivationPanel.tsx", "utf8");
    expect(catalog).toMatch(/<li[\s\S]*isLaCheie[\s\S]*<LaCheieActivationPanel/);
    expect(laCheie).toContain('"Solicită activarea"');
    expect(laCheie).not.toContain("LaCheieResendPanel");
  });

  it("folosește mesaje simple pentru date lipsă și erori", () => {
    const catalog = readFileSync("src/components/app/AgencyPortalCatalogCard.tsx", "utf8");
    const laCheie = readFileSync("src/components/app/LaCheieActivationPanel.tsx", "utf8");
    expect(laCheie).toContain("Completează datele agenției în");
    expect(laCheie).toContain("Activarea nu a reușit acum. Încearcă din nou sau scrie-ne.");
    expect(catalog).toContain("Cererea nu a fost trimisă. Încearcă din nou.");
  });

  it("nu afișează termeni tehnici", () => {
    const sources = [
      readFileSync("src/components/app/AgencyPortalCatalogCard.tsx", "utf8"),
      readFileSync("src/components/app/LaCheieActivationPanel.tsx", "utf8"),
    ];
    const visibleStrings = sources.flatMap((source) =>
      [...source.matchAll(/(?:"([^"\n]*)"|'([^'\n]*)'|>([^<{\n]+)<)/g)].map(
        (match) => match[1] ?? match[2] ?? match[3] ?? "",
      ),
    );
    expect(visibleStrings.join(" ")).not.toMatch(/\b(?:API|feed|XML|JSON|cheie|sincronizare|extern_id)\b/i);
  });
});
