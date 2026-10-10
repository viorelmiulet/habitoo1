import { describe, expect, it } from "vitest";
import { ensureSuperadminProfile, platformAdminEligible } from "./chat-rules";

describe("superadmin în chat", () => {
  it("fără profil: profilul se creează și este eligibil", () => {
    const profiles = new Map<string, { full_name: string; is_active: boolean | null }>();
    expect(platformAdminEligible({ isSuperadmin: true, profile: null })).toBe(true);
    const p = ensureSuperadminProfile(profiles, { id: "sa", email: "contact@mvaimobiliare.ro" });
    expect(p).toEqual({ full_name: "contact@mvaimobiliare.ro", is_active: true });
    expect(platformAdminEligible({ isSuperadmin: true, profile: p })).toBe(true);
    expect(ensureSuperadminProfile(profiles, { id: "x", email: "a@b.ro", fullName: "Viorel Miulet" }).full_name).toBe("Viorel Miulet");
  });
  it("profil inactiv explicit: neeligibil", () => {
    expect(platformAdminEligible({ isSuperadmin: true, profile: { is_active: false } })).toBe(false);
    expect(platformAdminEligible({ isSuperadmin: false, profile: { is_active: true } })).toBe(false);
  });
});
