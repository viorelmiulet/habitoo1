import { describe, expect, it } from "vitest";
import { getRonEurRateForDate, parseBnrYearXml } from "./commissions-rates.server";

const XML = `<?xml version="1.0" encoding="utf-8"?>
<DataSet><Body><OrigCurrency>RON</OrigCurrency>
<Cube date="2026-06-10"><Rate currency="EUR">5.0123</Rate><Rate currency="USD">4.4</Rate></Cube>
<Cube date="2026-06-12"><Rate currency="EUR" multiplier="1">4.9876</Rate></Cube>
</Body></DataSet>`;

function fakeTable(stored: { day: string; eur_ron: number }[]) {
  const rows = [...stored];
  return {
    rows,
    select: () => ({
      lte: (_c: string, v: string) => ({
        gte: (_c2: string, v2: string) => ({
          order: () => ({
            limit: async () => ({
              data: rows.filter((r) => r.day <= v && r.day >= v2).sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 1),
            }),
          }),
        }),
      }),
    }),
    upsert: async (incoming: { day: string; eur_ron: number }[]) => {
      for (const r of incoming) {
        const i = rows.findIndex((x) => x.day === r.day);
        if (i >= 0) rows[i] = r;
        else rows.push(r);
      }
      return { error: null };
    },
  };
}

const fetchImpl = async () => new Response(XML, { status: 200 });

describe("cursul BNR", () => {
  it("parsează XML-ul anual (doar EUR, fără multiplier)", () => {
    expect(parseBnrYearXml(XML)).toEqual([
      { day: "2026-06-10", eurRon: 5.0123 },
      { day: "2026-06-12", eurRon: 4.9876 },
    ]);
  });

  it("citește din cache fără cerere la BNR", async () => {
    const table = fakeTable([{ day: "2026-06-10", eur_ron: 5.0123 }]);
    let called = false;
    const r = await getRonEurRateForDate("2026-06-10", {
      table,
      fetchImpl: async () => { called = true; return fetchImpl(); },
    });
    expect(r).toEqual({ date: "2026-06-10", rateDate: "2026-06-10", rate: 5.0123 });
    expect(called).toBe(false);
  });

  it("la cache gol descarcă anul de la BNR și îl păstrează", async () => {
    const table = fakeTable([]);
    const r = await getRonEurRateForDate("2026-06-12", { table, fetchImpl });
    expect(r.rate).toBe(4.9876);
    expect(table.rows).toHaveLength(2);
  });

  it("în weekend folosește ultimul curs publicat anterior", async () => {
    const table = fakeTable([]);
    // 2026-06-13 e sâmbătă; ultimul curs e cel de vineri 12 iunie.
    const r = await getRonEurRateForDate("2026-06-13", { table, fetchImpl });
    expect(r).toEqual({ date: "2026-06-13", rateDate: "2026-06-12", rate: 4.9876 });
  });

  it("cursul din ziua tranzacției diferă de cel al altei zile", async () => {
    const table = fakeTable([]);
    const a = await getRonEurRateForDate("2026-06-10", { table, fetchImpl });
    const b = await getRonEurRateForDate("2026-06-12", { table, fetchImpl });
    expect(a.rate).toBe(5.0123);
    expect(b.rate).toBe(4.9876);
  });
});
