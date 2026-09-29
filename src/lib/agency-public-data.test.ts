import { describe, expect, it } from "vitest";
import {
  buildCompletionPatch,
  completeAgencyDataSchema,
  missingAgencyPublicFields,
  mustCompleteAgencyData,
  normalizeRoPhone,
  validateRequiredAgencyField,
} from "./agency-public-data";

const incomplete = { status: "active", email: "a@b.ro", phone: null, material_address: null, city: "Cluj", postal_code: null };
const complete = { status: "active", email: "a@b.ro", phone: "0722123456", material_address: "Str. Mare 10", city: "Cluj", postal_code: "400001" };

describe("datele publice obligatorii ale agenției", () => {
  it("agenție cu date lipsă → adminul e oprit, agentul nu", () => {
    expect(mustCompleteAgencyData({ roles: ["agency_admin"], impersonating: false, org: incomplete })).toBe(true);
    expect(mustCompleteAgencyData({ roles: ["agent"], impersonating: false, org: incomplete })).toBe(false);
  });
  it("superadminul nu e blocat, nici când intră în contul agenției", () => {
    expect(mustCompleteAgencyData({ roles: ["superadmin"], impersonating: false, org: incomplete })).toBe(false);
    expect(mustCompleteAgencyData({ roles: ["agency_admin"], impersonating: true, org: incomplete })).toBe(false);
  });
  it("agenție suspendată nu ajunge la această poartă", () => {
    expect(mustCompleteAgencyData({ roles: ["agency_admin"], impersonating: false, org: { ...incomplete, status: "suspended" } })).toBe(false);
  });
  it("salvare completă → accesul e deblocat, fără suprascrierea câmpurilor completate", () => {
    const input = completeAgencyDataSchema.parse({ phone: "+40 722 123 456", material_address: "Str. Mare 10", postal_code: "400001", email: "alt@x.ro" });
    const patch = buildCompletionPatch(incomplete, input);
    expect(patch).toEqual({ phone: "0722123456", material_address: "Str. Mare 10", postal_code: "400001" });
    const after = { ...incomplete, ...patch };
    expect(missingAgencyPublicFields(after)).toEqual([]);
    expect(mustCompleteAgencyData({ roles: ["agency_admin"], impersonating: false, org: after })).toBe(false);
    expect(mustCompleteAgencyData({ roles: ["agency_admin"], impersonating: false, org: complete })).toBe(false);
  });
  it("câmp lipsă necompletat → refuzat", () => {
    expect(() => buildCompletionPatch(incomplete, completeAgencyDataSchema.parse({ phone: "0722123456" }))).toThrow();
  });
  it("validări: email, telefon RO, cod poștal, website https", () => {
    expect(normalizeRoPhone("0722.123.456")).toBe("0722123456");
    expect(normalizeRoPhone("0040 21 123 4567")).toBe("0211234567");
    expect(normalizeRoPhone("12345")).toBeNull();
    expect(validateRequiredAgencyField("postal_code", "12345")).not.toBeNull();
    expect(validateRequiredAgencyField("email", "nu-e-email")).not.toBeNull();
    expect(validateRequiredAgencyField("phone", "")).not.toBeNull();
    expect(completeAgencyDataSchema.safeParse({ material_website: "http://x.ro" }).success).toBe(false);
    expect(completeAgencyDataSchema.safeParse({ material_website: "https://x.ro" }).success).toBe(true);
  });
});

describe("aprobarea cererii de înregistrare", () => {
  it("copiază emailul și telefonul din cerere în organizație", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync("drizzle/migrations/0094_agency_required_public_data.sql", "utf8");
    const insert = sql.slice(sql.indexOf("INSERT INTO public.organizations"), sql.indexOf("RETURNING id INTO _org"));
    expect(insert).toMatch(/is_trial, created_by, updated_by,\s*email, phone\)/);
    expect(insert).toContain("nullif(btrim(_r.phone),'')");
    expect(insert).toContain("_r.email");
  });
});
