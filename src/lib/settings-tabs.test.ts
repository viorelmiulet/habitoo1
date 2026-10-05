import { describe, expect, it } from "vitest";
import { visibleSettingsTabs } from "./settings-tabs";

describe("filele din Setări", () => {
  it("agentul vede doar Profil și Acces", () => {
    expect(visibleSettingsTabs({ role: "agent", isAdmin: false })).toEqual(["profile", "access"]);
    expect(
      visibleSettingsTabs({ role: "agent", isAdmin: false, organization: { ai_enabled: true } }),
    ).not.toContain("ai");
  });
  it("managerul vede fila AI doar când AI e activat pentru agenție", () => {
    expect(
      visibleSettingsTabs({ role: "agency_admin", isAdmin: true, organization: { ai_enabled: true } }),
    ).toEqual(["profile", "access", "agency", "branding", "team", "portals", "promotion", "integrations", "ai"]);
    expect(
      visibleSettingsTabs({ role: "agency_admin", isAdmin: true, organization: { ai_enabled: false } }),
    ).not.toContain("ai");
    expect(visibleSettingsTabs({ role: "agency_admin", isAdmin: true })).not.toContain("ai");
  });
  it("superadminul rămâne exceptat", () => {
    expect(visibleSettingsTabs({ role: "agency_admin", isAdmin: true, isSuperadmin: true })).toContain("ai");
  });
});
