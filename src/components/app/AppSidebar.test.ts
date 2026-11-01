import { describe, expect, it } from "vitest";
import { agencyNav, agencyNavFor, withMarketDataNav } from "./AppSidebar";
import { activeNavigationPath, sidebarOpenStateKey, filterAiNavigation, AI_NAV_FEATURE } from "./sidebar-navigation";
import type { AiFeatureMap } from "@/lib/ai/features/keys";

const paths = (admin: boolean) => agencyNavFor(admin).flatMap(g => g.items.map(i => String(i.to)));
describe("meniul lateral compact", () => {
  it("păstrează ordinea celor trei secțiuni și grupurile", () => {
    expect(agencyNav.map(g => g.title ?? g.items[0]?.label)).toEqual([
      "Acasă", "Proprietăți", "Lead-uri", "Clienți", "Calendar", "Matching",
      "Colaborare", "Anunțuri particulari", "ACP", "Asistent AI", "Comisioane", "Rapoarte", "Setări",
    ]);
    expect(agencyNav.filter(g => g.section).map(g => g.section)).toEqual(["Creștere", "Agenție"]);
    expect(agencyNav.find(g => g.title === "Clienți")?.items.map(i => i.to)).toEqual(["/app/contacts", "/app/requests", "/app/contracts"]);
    expect(agencyNav.find(g => g.title === "Calendar")?.items.map(i => i.to)).toEqual(["/app/calendar", "/app/activities"]);
    expect(agencyNav.find(g => g.title === "Rapoarte")?.items.map(i => i.to)).toEqual(["/app/reports", "/app/goals"]);
  });
  it("agentul nu vede administrarea agenției sau abonamentul", () => {
    expect(paths(false)).not.toContain("/app/team");
    expect(paths(false)).not.toContain("/abonament");
    expect(agencyNavFor(false).flatMap(g => g.items).find(i => i.to === "/app/settings")?.label).toBe("Profilul meu");
    expect(agencyNavFor(false).flatMap(g => g.items).map(i => i.label)).not.toContain("Setări agenție");
  });
  it("administratorul vede Agenți, Setări agenție și Alege abonamentul", () => {
    expect(paths(true)).toContain("/app/team");
    expect(paths(true)).toContain("/abonament");
    expect(agencyNavFor(true).flatMap(g => g.items).find(i => i.to === "/app/settings")?.label).toBe("Setări agenție");
  });
  it("fără AI activat grupul Asistent AI dispare", () => {
    expect(filterAiNavigation(agencyNav, {} as AiFeatureMap).some(g => g.title === "Asistent AI")).toBe(false);
  });
  it("păstrează numai funcțiile AI activate, chiar dacă rămâne una", () => {
    const nav = filterAiNavigation(agencyNav, { ai_crm: true } as AiFeatureMap);
    expect(nav.find(g => g.title === "Asistent AI")?.items.map(i => i.to)).toEqual(["/app/ai-crm"]);
    expect(Object.keys(AI_NAV_FEATURE)).toHaveLength(5);
    expect(nav.find(g => g.title === "Asistent AI")?.collapsible).toBe(true);
  });
  it("Date piață rămâne numai pentru SuperAdmin", () => {
    expect(withMarketDataNav(agencyNav, false).flatMap(g => g.items).map(i => i.to)).not.toContain("/app/acp/date-piata");
    expect(withMarketDataNav(agencyNav, true).find(g => g.title === "ACP")?.items.map(i => i.to)).toContain("/app/acp/date-piata");
  });
  it("alege o singură pagină activă și păstrează starea per utilizator", () => {
    expect(activeNavigationPath("/app/properties/new", agencyNav)).toBe("/app/properties/new");
    expect(activeNavigationPath("/app/acp", agencyNav)).toBe("/app/acp");
    expect(sidebarOpenStateKey("user-a")).toBe("habitoo.sidebar.groups.user-a");
    expect(sidebarOpenStateKey("user-a")).not.toBe(sidebarOpenStateKey("user-b"));
  });
});
