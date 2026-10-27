import { describe, expect, it } from "vitest";
import { GUIDE_IDS, SAFE_SHOW_SELECTORS, accessibleGuides, guideForPath, guidePathMatches, guidesForContext, implementedGuides, stepsForUser } from "./onboarding-tour";
import { plannedGuides } from "./onboarding-catalog";
import { emptyAiFeatureMap, type AiFeatureMap } from "./ai/features/keys";

const allFeatures: AiFeatureMap = { ...emptyAiFeatureMap(), ai_marketing: true, ai_media: true };

describe("potrivirea căilor și a contextelor", () => {
  it("segmentul :id se potrivește cu orice valoare, dar nu cu alte adâncimi", () => {
    expect(guidePathMatches("/app/properties/:id", "/app/properties/abc-123")).toBe(true);
    expect(guidePathMatches("/app/properties/:id", "/app/properties")).toBe(false);
    expect(guidePathMatches("/app/properties/:id", "/app/properties/abc/extra")).toBe(false);
  });
  it("pagina de adăugare rămâne pe ghidul ei, nu pe cel de detaliu", () => {
    expect(guideForPath("/app/properties/new")?.id).toBe("property-create");
    expect(guideForPath("/app/properties/abc")?.id).toBe("property-detail");
  });
  it("ghidurile contextuale se găsesc pe filă, în ordinea declarată", () => {
    expect(guidesForContext("/app/properties/abc", "property-tab:media").map((g) => g.id)).toEqual(["property-media"]);
    expect(guidesForContext("/app/properties/abc", "property-tab:publishing").map((g) => g.id)).toEqual(["property-publishing", "property-promotions"]);
    expect(guidesForContext("/app/properties/abc", "property-tab:leads").map((g) => g.id)).toEqual(["property-leads"]);
    expect(guidesForContext("/app/properties/abc", "property:editing").map((g) => g.id)).toEqual(["property-edit"]);
    expect(guidesForContext("/app/collaboration", "property-tab:media")).toEqual([]);
  });
});

describe("pașii filtrați pe rol și funcții AI", () => {
  const detail = implementedGuides.find((g) => g.id === "property-detail");
  if (!detail) throw new Error("Ghid proprietate lipsă");
  it("agentul nu vede pasul de reasignare, adminul îl vede", () => {
    expect(stepsForUser(detail, "agent", allFeatures).some((s) => s.id === "reassign")).toBe(false);
    expect(stepsForUser(detail, "agency_admin", allFeatures).some((s) => s.id === "reassign")).toBe(true);
  });
  it("pasul Studio AI din Poze apare doar cu funcția activată", () => {
    const media = implementedGuides.find((g) => g.id === "property-media");
    if (!media) throw new Error("Ghid Poze lipsă");
    expect(stepsForUser(media, "agent", emptyAiFeatureMap()).some((s) => s.id === "ai")).toBe(false);
    expect(stepsForUser(media, "agent", allFeatures).some((s) => s.id === "ai")).toBe(true);
  });
  it("ghidul Marketing AI nu e deloc disponibil fără funcție", () => {
    expect(accessibleGuides(implementedGuides, "agent", emptyAiFeatureMap()).some((g) => g.id === "property-marketing")).toBe(false);
    expect(accessibleGuides(implementedGuides, "agent", allFeatures).some((g) => g.id === "property-marketing")).toBe(true);
  });
  it("niciun ghid nu depășește 8 pași pentru niciun rol", () => {
    for (const guide of implementedGuides) {
      for (const role of ["agent", "agency_admin", "superadmin"] as const) {
        expect(stepsForUser(guide, role, allFeatures).length, `${guide.id}/${role}`).toBeLessThanOrEqual(8);
      }
    }
  });
});

describe("inventarul reorganizat", () => {
  it("în jur de 40 de ghiduri pentru agent și admin (implementate + planificate)", () => {
    const implementedAgency = implementedGuides.filter((g) => g.roles.includes("agent")).length;
    const plannedAgency = plannedGuides.filter((g) => g.roles.includes("agent")).length;
    const total = implementedAgency + plannedAgency;
    expect(total).toBeGreaterThanOrEqual(38);
    expect(total).toBeLessThanOrEqual(52);
  });
  it("ghidurile SuperAdmin sunt la finalul inventarului", () => {
    const firstSuper = plannedGuides.findIndex((g) => g.roles.length === 1 && g.roles[0] === "superadmin");
    expect(firstSuper).toBeGreaterThan(0);
    expect(plannedGuides.slice(firstSuper).every((g) => g.roles.length === 1 && g.roles[0] === "superadmin")).toBe(true);
  });
  it("inventarul nu repetă ghidurile deja implementate", () => {
    const done = new Set(implementedGuides.map((g) => g.id));
    expect(plannedGuides.some((g) => done.has(g.id))).toBe(false);
  });
});

describe("etapa 3 — reguli de acces, pornire și siguranță", () => {
  const ids = ["contacts-list", "contact-detail", "contact-create", "requests-list", "request-detail", "leads-list", "contracts-list", "contract-detail", "activities", "calendar", "matching", "notifications", "clipurile-mele", "support"];
  it("toate cele 14 ghiduri sunt înregistrate pentru progresul existent", () => {
    expect(implementedGuides.filter((g) => ids.includes(g.id))).toHaveLength(14);
    for (const id of ids) expect(GUIDE_IDS).toContain(id);
  });
  it("contactul nou pornește la deschiderea ferestrei, nu la simpla vizită a listei", () => {
    expect(guideForPath("/app/contacts")?.id).toBe("contacts-list");
    expect(guidesForContext("/app/contacts", "contact:creating").map((g) => g.id)).toEqual(["contact-create"]);
    expect(guidesForContext("/app/requests", "contact:creating")).toEqual([]);
  });
  it("atribuirea lead-ului este explicată doar administratorului", () => {
    const guide = implementedGuides.find((g) => g.id === "leads-list");
    if (!guide) throw Error("Ghid lipsă");
    expect(stepsForUser(guide, "agent", allFeatures).some((s) => s.id === "agent")).toBe(false);
    expect(stepsForUser(guide, "agency_admin", allFeatures).some((s) => s.id === "agent")).toBe(true);
  });
  it("elementele absente se sar, fără pași interactivi pe acțiuni finale", () => {
    const forbidden = /save|send|delete|pdf|done|stage|drag|submit|sign/;
    for (const guide of implementedGuides.filter((g) => ids.includes(g.id))) {
      for (const step of guide.steps) {
        if (step.selector) expect(step.optional).toBe(true);
        if (step.mode === "do") expect(step.selector).not.toMatch(forbidden);
        if (step.show) {
          expect(Object.keys(SAFE_SHOW_SELECTORS)).toContain(step.show);
          expect(SAFE_SHOW_SELECTORS[step.show as keyof typeof SAFE_SHOW_SELECTORS]).not.toMatch(forbidden);
        }
      }
    }
  });
  it("ACP, asistentul, chatul și cele două unelte rapide rămân planificate", () => {
    const required = ["acp-new", "acp-saved", "acp-detail", "habitoo-ai", "agent-chat", "topbar-search", "topbar-add"];
    for (const id of required) {
      expect(plannedGuides.some((g) => g.id === id)).toBe(true);
      expect(implementedGuides.some((g) => g.id === id)).toBe(false);
    }
  });
});
