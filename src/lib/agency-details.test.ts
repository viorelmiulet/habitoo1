import { describe, expect, it } from "vitest";
import { agencyDetailsSchema, diffAgencyDetails } from "./agency-details";

const base = {
  name: "Agenția X", legal_name: "", cui: "", trade_registry_number: "", email: "", phone: "",
  city: "", postal_code: "", material_phone: "", material_email: "", material_website: "", material_address: "",
};

describe("agencyDetailsSchema", () => {
  it("acceptă CUI cu sau fără RO, cod poștal de 6 cifre, website https", () => {
    const r = agencyDetailsSchema.parse({ ...base, cui: "RO123456", postal_code: "010101", material_website: "https://x.ro" });
    expect(r.cui).toBe("RO123456");
    expect(agencyDetailsSchema.parse({ ...base, cui: "123456" }).cui).toBe("123456");
    expect(r.legal_name).toBeNull();
  });
  it.each([
    ["cui", "RO12A"],
    ["postal_code", "12345"],
    ["email", "nu-e-email"],
    ["material_website", "http://x.ro"],
  ])("respinge %s = %s", (field, value) => {
    expect(agencyDetailsSchema.safeParse({ ...base, [field]: value }).success).toBe(false);
  });
});

describe("diffAgencyDetails", () => {
  it("jurnalizează doar câmpurile schimbate, cu valoarea veche și nouă", () => {
    const d = diffAgencyDetails({ cui: "1", name: "A" }, { cui: "2", name: "A" }, ["cui", "name"]);
    expect(d).toEqual({ oldValues: { cui: "1" }, newValues: { cui: "2" }, changed: ["cui"] });
  });
});
