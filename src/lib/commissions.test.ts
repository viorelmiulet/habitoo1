import { describe, expect, it } from "vitest";
import {
  canEditCommission,
  commissionTotals,
  emptyCommissionForm,
  parseAmountText,
  prefillFromContract,
  prefillFromProperty,
  toCommissionPayload,
} from "./commissions";

const property = {
  id: "p1", transaction_kind: "sale", property_type: "house", owner_contact_id: "c1",
  price: 120000, sale_price: 125000, currency: "EUR", commission: "2500", assigned_to: "a1",
};

describe("precompletare", () => {
  it("formularul din proprietate vine precompletat", () => {
    const f = prefillFromProperty(emptyCommissionForm("a1"), property);
    expect(f).toMatchObject({
      transaction_kind: "sale", property_type: "house", property_id: "p1", contact_id: "c1",
      transaction_value: "125000", agency_commission: "2500", currency: "EUR",
    });
  });
  it("comisionul în procente nu se calculează", () => {
    const f = prefillFromProperty(emptyCommissionForm("a1"), { ...property, commission: "2%" });
    expect(f.agency_commission).toBe("");
  });
  it("contractul are prioritate pentru preț, client și comision", () => {
    const f = prefillFromContract(emptyCommissionForm("a1"),
      { property_id: "p1", contact_id: "c9", price: 118000, currency: "RON", commission: "3.000" }, property);
    expect(f).toMatchObject({ property_id: "p1", contact_id: "c9", transaction_value: "118000", agency_commission: "3000", currency: "RON", property_type: "house" });
  });
  it("parsează sume românești", () => {
    expect(parseAmountText("1.500,50")).toBe("1500.5");
    expect(parseAmountText("1500 EUR")).toBe("1500");
    expect(parseAmountText("negociabil")).toBe("");
  });
});

describe("drepturi", () => {
  const own = { agent_id: "a1", created_by: "a1", allocated_by_admin: false, agency_commission: 1, agent_amount: 1, currency: "EUR", status: "pending" };
  it("agentul își modifică doar comisioanele proprii", () => {
    expect(canEditCommission(own, "a1", false)).toBe(true);
    expect(canEditCommission({ ...own, agent_id: "a2", created_by: "a2" }, "a1", false)).toBe(false);
  });
  it("comisioanele alocate de admin sunt doar de citit pentru agent", () => {
    expect(canEditCommission({ ...own, created_by: "adm", allocated_by_admin: true }, "a1", false)).toBe(false);
    expect(canEditCommission({ ...own, created_by: "adm", allocated_by_admin: true }, "adm", true)).toBe(true);
  });
});

describe("totaluri", () => {
  it("adună pe monedă și exclude anulatele", () => {
    const base = { agent_id: "a", created_by: "a", allocated_by_admin: false };
    const t = commissionTotals([
      { ...base, agency_commission: 1000, agent_amount: 400, currency: "EUR", status: "collected" },
      { ...base, agency_commission: 500, agent_amount: 200, currency: "EUR", status: "pending" },
      { ...base, agency_commission: 900, agent_amount: 900, currency: "EUR", status: "cancelled" },
      { ...base, agency_commission: 3000, agent_amount: 1000, currency: "RON", status: "pending" },
    ]);
    expect(t["EUR"]).toEqual({ agency: 1500, agent: 600, collected: 1000, pending: 500 });
    expect(t["RON"]?.agency).toBe(3000);
  });
  it("adresa se păstrează doar fără proprietate legată", () => {
    const f = { ...emptyCommissionForm("a"), property_id: "p1", location_text: "Titan" };
    expect(toCommissionPayload(f).location_text).toBeNull();
  });
});
