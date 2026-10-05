import { describe, expect, it } from "vitest";
import { visibleSettingsTabs } from "./settings-tabs";

describe("filele din Setări", () => {
  it("agentul vede doar Profil și Acces", () => {
    expect(visibleSettingsTabs({ role: "agent", isAdmin: false })).toEqual(["profile", "access"]);
  });
  it("managerul vede toate filele", () => {
    expect(visibleSettingsTabs({ role: "agency_admin", isAdmin: true })).toEqual([
      "profile", "access", "agency", "branding", "team", "portals", "promotion", "integrations", "ai",
    ]);
  });
});
