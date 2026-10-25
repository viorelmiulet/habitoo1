import { describe, expect, it } from "vitest";
import {
  breakdownBy,
  compareValue,
  lastYearRange,
  monthlySeries,
  previousRange,
  reportKpis,
  reportRange,
  toEur,
  type CommissionReportRow,
} from "./commissions-reports";

const row = (over: Partial<CommissionReportRow>): CommissionReportRow => ({
  agent_id: "a1",
  transaction_date: "2026-06-10",
  transaction_kind: "sale",
  property_type: "apartment",
  agency_commission: 1000,
  agent_amount: 400,
  currency: "EUR",
  status: "collected",
  ron_to_eur_rate: null,
  ...over,
});

describe("perioade", () => {
  const today = new Date("2026-10-25T12:00:00Z"); // duminică
  it("săptămâna curentă începe luni și se termină duminică", () => {
    expect(reportRange("week", today)).toEqual({ from: "2026-10-19", to: "2026-10-25" });
  });
  it("luna și anul curent", () => {
    expect(reportRange("month", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(reportRange("year", today)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });
  it("intervalul la alegere se inversează dacă e dat invers", () => {
    expect(reportRange("custom", today, { from: "2026-05-10", to: "2026-05-01" }))
      .toEqual({ from: "2026-05-01", to: "2026-05-10" });
  });
  it("perioada anterioară are aceeași lungime și se lipește de cea curentă", () => {
    // 31 de zile încheiate pe 30 septembrie încep pe 31 august.
    expect(previousRange({ from: "2026-10-01", to: "2026-10-31" }))
      .toEqual({ from: "2026-08-31", to: "2026-09-30" });
    expect(previousRange({ from: "2026-10-19", to: "2026-10-25" }))
      .toEqual({ from: "2026-10-12", to: "2026-10-18" });
  });
  it("aceeași perioadă de anul trecut", () => {
    expect(lastYearRange({ from: "2026-10-01", to: "2026-10-31" }))
      .toEqual({ from: "2025-10-01", to: "2025-10-31" });
  });
});

describe("conversia RON→EUR", () => {
  it("folosește cursul păstrat pe comision, din ziua tranzacției", () => {
    expect(toEur(5000, "RON", 5)).toBe(1000);
    expect(toEur(4976, "RON", 4.976)).toBeCloseTo(1000, 6);
  });
  it("EUR trece neschimbat; RON fără curs nu intră în total", () => {
    expect(toEur(1000, "EUR", null)).toBe(1000);
    expect(toEur(5000, "RON", null)).toBe(0);
  });
  it("rapoartele vechi nu se schimbă: două comisioane RON cu cursuri diferite se convertesc fiecare cu cursul lui", () => {
    const k = reportKpis([
      row({ currency: "RON", agency_commission: 5000, agent_amount: 2500, ron_to_eur_rate: 5 }),
      row({ currency: "RON", agency_commission: 5100, agent_amount: 2550, ron_to_eur_rate: 5.1, transaction_date: "2026-06-11" }),
    ]);
    expect(k.agencyEur).toBeCloseTo(2000, 6);
    expect(k.agentEur).toBeCloseTo(1000, 6);
  });
});

describe("indicatori", () => {
  it("totaluri, medie și încasat/de încasat; anulatele nu intră", () => {
    const k = reportKpis([
      row({ agency_commission: 1000, agent_amount: 400, status: "collected" }),
      row({ agency_commission: 500, agent_amount: 200, status: "pending", transaction_date: "2026-06-12" }),
      row({ agency_commission: 900, agent_amount: 900, status: "cancelled", transaction_date: "2026-06-13" }),
    ]);
    expect(k.agencyEur).toBe(1500);
    expect(k.agentEur).toBe(600);
    expect(k.count).toBe(2);
    expect(k.avgEur).toBe(750);
    expect(k.collectedEur).toBe(1000);
    expect(k.pendingEur).toBe(500);
  });
  it("comparația dă diferența în valoare și procente; fără referință nu dă procent", () => {
    expect(compareValue(1500, 1000)).toEqual({ diff: 500, pct: 50 });
    expect(compareValue(800, 1000)).toEqual({ diff: -200, pct: -20 });
    expect(compareValue(500, 0)).toEqual({ diff: 500, pct: null });
  });
});

describe("agentul vede doar cifrele lui", () => {
  it("indicatorii pe rândurile filtrate pe agent nu includ alt agent", () => {
    const rows = [
      row({ agent_id: "a1", agency_commission: 1000 }),
      row({ agent_id: "a2", agency_commission: 7000, transaction_date: "2026-06-11" }),
    ];
    const mine = rows.filter((r) => r.agent_id === "a1");
    const k = reportKpis(mine);
    expect(k.agencyEur).toBe(1000);
    expect(k.count).toBe(1);
  });
});

describe("grafice", () => {
  it("evoluția pe luni compară perioada aleasă cu anul trecut", () => {
    const rows = [
      row({ transaction_date: "2026-03-05", agency_commission: 1000 }),
      row({ transaction_date: "2025-03-10", agency_commission: 600 }),
      row({ transaction_date: "2025-04-02", agency_commission: 300 }),
      row({ transaction_date: "2026-03-20", agency_commission: 999, status: "cancelled" }),
    ];
    const s = monthlySeries(rows, { from: "2026-03-01", to: "2026-04-30" });
    expect(s).toEqual([
      { month: "2026-03", current: 1000, lastYear: 600 },
      { month: "2026-04", current: 0, lastYear: 300 },
    ]);
  });
  it("împărțirea pe tip tranzacție și pe agent (clasament descrescător)", () => {
    const rows = [
      row({ transaction_kind: "sale", agency_commission: 1000, agent_id: "a1" }),
      row({ transaction_kind: "rent", agency_commission: 300, agent_id: "a2", transaction_date: "2026-06-11" }),
      row({ transaction_kind: "sale", agency_commission: 500, agent_id: "a2", transaction_date: "2026-06-12" }),
    ];
    expect(breakdownBy(rows, "transaction_kind")).toEqual([
      { key: "sale", value: 1500, count: 2 },
      { key: "rent", value: 300, count: 1 },
    ]);
    expect(breakdownBy(rows, "agent_id")[0]).toEqual({ key: "a1", value: 1000, count: 1 });
  });
});
