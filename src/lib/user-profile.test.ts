import { describe, expect, it } from "vitest";
import {
  inviteAgentSchema,
  mustCompleteUserProfile,
  normalizeRoMobile,
  profileEditDenial,
  profileEditSchema,
} from "./user-profile";

const A = "11111111-1111-4111-8111-111111111111";
const admin = { id: "admin", organizationId: "org1", roles: ["agency_admin"] };

describe("telefon mobil RO", () => {
  it("normalizează formatele acceptate", () => {
    expect(normalizeRoMobile("0722 123 456")).toBe("0722123456");
    expect(normalizeRoMobile("+40 722 123 456")).toBe("0722123456");
    expect(normalizeRoMobile("0040-722.123.456")).toBe("0722123456");
  });
  it("respinge fix, scurt sau gol", () => {
    for (const v of ["0212345678", "072212345", "", null, "abc"]) expect(normalizeRoMobile(v)).toBeNull();
  });
});

describe("permisiuni de editare", () => {
  it("adminul editează un agent din agenția lui", () => {
    expect(profileEditDenial(admin, { id: "a", organizationId: "org1", roles: ["agent"] })).toBeNull();
  });
  it("respinge agent din altă agenție", () => {
    expect(profileEditDenial(admin, { id: "a", organizationId: "org2", roles: ["agent"] })).toMatch(/agenția ta/);
  });
  it("respinge alt admin", () => {
    expect(
      profileEditDenial(admin, { id: "b", organizationId: "org1", roles: ["agency_admin", "agent"] }),
    ).toMatch(/administrator/);
  });
  it("agentul nu editează pe altcineva, dar își editează profilul", () => {
    const agent = { id: "a", organizationId: "org1", roles: ["agent"] };
    expect(profileEditDenial(agent, { id: "c", organizationId: "org1", roles: ["agent"] })).not.toBeNull();
    expect(profileEditDenial(agent, { ...agent })).toBeNull();
  });
  it("emailul de autentificare, rolul sau agenția sunt respinse pe server", () => {
    const base = { userId: A, full_name: "Ion Pop", phone: "0722123456" };
    expect(profileEditSchema.safeParse(base).success).toBe(true);
    expect(profileEditSchema.safeParse({ ...base, email: "x@y.ro" }).success).toBe(false);
    expect(profileEditSchema.safeParse({ ...base, organization_id: A }).success).toBe(false);
    expect(profileEditSchema.safeParse({ ...base, role: "agency_admin" }).success).toBe(false);
  });
  it("salvează telefonul normalizat", () => {
    const r = profileEditSchema.parse({ userId: A, full_name: "Ion Pop", phone: "+40 722 123 456" });
    expect(r.phone).toBe("0722123456");
  });
});

describe("ecranul „Completează-ți profilul”", () => {
  const roles = ["agent"];
  it("apare doar când lipsește telefonul sau numele", () => {
    expect(mustCompleteUserProfile({ roles, impersonating: false, profile: { full_name: "Ion Pop", phone: "0722123456" } })).toBe(false);
    expect(mustCompleteUserProfile({ roles, impersonating: false, profile: { full_name: "Ion Pop", phone: null } })).toBe(true);
    expect(mustCompleteUserProfile({ roles, impersonating: false, profile: { full_name: "", phone: "0722123456" } })).toBe(true);
  });
  it("nu apare pentru superadmin sau în impersonare", () => {
    const profile = { full_name: null, phone: null };
    expect(mustCompleteUserProfile({ roles: ["superadmin"], impersonating: false, profile })).toBe(false);
    expect(mustCompleteUserProfile({ roles, impersonating: true, profile })).toBe(false);
  });
});

describe("invitarea unui agent", () => {
  it("nu se poate crea fără telefon", () => {
    expect(inviteAgentSchema.safeParse({ email: "a@b.ro", full_name: "Ion Pop" }).success).toBe(false);
    expect(inviteAgentSchema.safeParse({ email: "a@b.ro", full_name: "Ion Pop", phone: "" }).success).toBe(false);
    expect(inviteAgentSchema.safeParse({ email: "a@b.ro", full_name: "Ion Pop", phone: "0722 123 456" }).success).toBe(true);
  });
});
