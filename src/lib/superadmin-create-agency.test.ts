import { describe, expect, it, vi } from "vitest";
import { createAgencyCore, EMAIL_IN_USE_MESSAGE, type CreateAgencyDeps } from "./superadmin-create-agency";
import { mustCompleteAgencyData } from "./agency-public-data";
import { mustCompleteUserProfile } from "./user-profile";

function deps(over: Partial<CreateAgencyDeps> = {}) {
  const sendEmail = vi.fn();
  const d = {
    isSuperadmin: vi.fn(async () => true),
    createAuthUser: vi.fn(async () => ({ id: "u1" })),
    createAgencyRows: vi.fn(async () => "org1"),
    deleteAuthUser: vi.fn(async () => {}),
    ...over,
  };
  return { d, sendEmail };
}
const minimal = { name: "Agenția X", email: "Admin@X.ro", password: "parola123" };

describe("createAgencyCore", () => {
  it("creează cu doar nume, email și parolă, fără email trimis", async () => {
    const { d, sendEmail } = deps();
    const res = await createAgencyCore(d, minimal);
    expect(res).toEqual({ organizationId: "org1", userId: "u1" });
    expect(d.createAuthUser).toHaveBeenCalledWith("admin@x.ro", "parola123");
    const rows = vi.mocked(d.createAgencyRows).mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(rows[0]).toBe("u1");
    expect(rows[1]).not.toHaveProperty("password");
    expect(d.deleteAuthUser).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("email existent → eroare clară, nimic creat", async () => {
    const { d } = deps({ createAuthUser: vi.fn(async () => ({ error: "x", emailInUse: true })) });
    await expect(createAgencyCore(d, minimal)).rejects.toThrow(EMAIL_IN_USE_MESSAGE);
    expect(d.createAgencyRows).not.toHaveBeenCalled();
  });
  it("eșec la profil → utilizatorul de autentificare e șters", async () => {
    const { d } = deps({ createAgencyRows: vi.fn(async () => { throw new Error("profil"); }) });
    await expect(createAgencyCore(d, minimal)).rejects.toThrow(/profil/);
    expect(d.deleteAuthUser).toHaveBeenCalledWith("u1");
  });
  it("fără rol superadmin → refuz, nimic creat", async () => {
    const { d } = deps({ isSuperadmin: vi.fn(async () => false) });
    await expect(createAgencyCore(d, minimal)).rejects.toThrow(/superadmin/);
    expect(d.createAuthUser).not.toHaveBeenCalled();
  });
  it("parola sub 8 caractere → respinsă", async () => {
    const { d } = deps();
    await expect(createAgencyCore(d, { ...minimal, password: "short" })).rejects.toThrow();
    expect(d.createAuthUser).not.toHaveBeenCalled();
  });
});

describe("blocări pentru agențiile create de superadmin", () => {
  const org = { status: "active", email: null, phone: null };
  it("mustCompleteAgencyData", () => {
    expect(mustCompleteAgencyData({ roles: ["agency_admin"], impersonating: false, org: { ...org, created_by_superadmin: true } })).toBe(false);
    expect(mustCompleteAgencyData({ roles: ["agency_admin"], impersonating: false, org: { ...org, created_by_superadmin: false } })).toBe(true);
    expect(mustCompleteAgencyData({ roles: ["agency_admin"], impersonating: false, org })).toBe(true);
  });
  it("mustCompleteUserProfile", () => {
    const profile = { full_name: "", phone: "" };
    expect(mustCompleteUserProfile({ roles: ["agent"], impersonating: false, profile, org: { created_by_superadmin: true } })).toBe(false);
    expect(mustCompleteUserProfile({ roles: ["agency_admin"], impersonating: false, profile, org: { created_by_superadmin: false } })).toBe(true);
    expect(mustCompleteUserProfile({ roles: ["agent"], impersonating: false, profile })).toBe(true);
  });
});

import { authCreateErrorMessage, isEmailInUseError as inUse, WEAK_PASSWORD_MESSAGE } from "./superadmin-create-agency";
describe("motivul refuzului contului", () => {
  it("422 weak_password → mesajul despre parolă, nu email folosit", () => {
    const err = { status: 422, code: "weak_password", message: "Password is known to be weak" };
    expect(inUse(err)).toBe(false);
    expect(authCreateErrorMessage(err, "Parola123!")).toBe(WEAK_PASSWORD_MESSAGE);
  });
  it("email_exists → email folosit", () => {
    expect(authCreateErrorMessage({ status: 422, code: "email_exists" }, "x")).toContain("Există deja un cont cu acest email.");
    expect(inUse({ code: "user_already_exists" })).toBe(true);
  });
  it("email_address_invalid → adresă neacceptată", () => {
    expect(authCreateErrorMessage({ status: 400, code: "email_address_invalid" }, "x")).toBe("Adresa de email nu este acceptată.");
  });
  it("altă eroare → mesaj generic cu motivul, fără parolă", () => {
    const msg = authCreateErrorMessage({ status: 422, code: "other", message: "Signups for SecretPass9 not allowed." }, "SecretPass9");
    expect(msg).toBe("Contul administratorului nu a putut fi creat: Signups for *** not allowed.");
    expect(msg).not.toContain("SecretPass9");
  });
});
