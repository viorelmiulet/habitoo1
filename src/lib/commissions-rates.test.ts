import { describe, expect, it, vi } from "vitest";
import { resolveCommissionSaveRate } from "./commission-save-rate";
import { emptyCommissionForm, toCommissionPayload } from "./commissions";
import { completeMissingCommissionRates, fetchBnrIntoCache, getRonEurRateForDate, parseBnrYearXml } from "./commissions-rates.server";

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
          order: () => ({
            limit: async () => ({
              data: rows.filter((r) => r.day <= v).sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 1),
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


describe("BNR recovery", () => {
  it("saves a EUR commission with null rate during outage and fills it on the next successful attempt", async () => {
    const table = fakeTable([]);
    const form = { ...emptyCommissionForm("agent"), transaction_date: "2026-10-25", agency_commission: "1000", agent_amount: "400", transaction_value: "100000" };
    const fetchFail = async () => { throw new Error("offline"); };
    const rate = await resolveCommissionSaveRate(form.transaction_date, undefined, date => getRonEurRateForDate(date, { table, fetchImpl: fetchFail }));
    const saved = { id: "commission", ...toCommissionPayload(form), ron_to_eur_rate: rate };
    expect(saved.currency).toBe("EUR"); expect(saved.agency_commission).toBe(1000); expect(saved.ron_to_eur_rate).toBeNull();
    const update = vi.fn(async (_ids, _date, newRate) => { saved.ron_to_eur_rate = newRate; });
    expect(await completeMissingCommissionRates([saved], { resolve: date => getRonEurRateForDate(date, { table, fetchImpl: fetchFail }), update })).toBe(0);
    expect(update).not.toHaveBeenCalled();
    const fridayXml = '<DataSet><Body><Cube date="2026-10-23"><Rate currency="EUR">5.0871</Rate></Cube></Body></DataSet>';
    expect(await completeMissingCommissionRates([saved], { resolve: date => getRonEurRateForDate(date, { table, fetchImpl: async () => new Response(fridayXml) }), update })).toBe(1);
    expect(saved.ron_to_eur_rate).toBe(5.0871);
  });
  it("uses Friday for Sunday 25 October and latest published rate for future dates", async () => {
    const table = fakeTable([{ day: "2026-10-23", eur_ron: 5.0871 }]);
    expect((await getRonEurRateForDate("2026-10-25", { table })).rateDate).toBe("2026-10-23");
    expect((await getRonEurRateForDate("2027-12-31", { table })).rateDate).toBe("2026-10-23");
  });
  it("tries current, ten-day, annual in order, uses browser headers and caches every EUR rate", async () => {
    const table = fakeTable([]); const urls: string[] = [];
    const fetchMock: typeof fetch = async (input, init) => {
      urls.push(String(input)); expect(new Headers(init?.headers).get("Accept")).toBe("application/xml");
      expect(new Headers(init?.headers).get("User-Agent")).toContain("Mozilla");
      return new Response(urls.length < 3 ? '<html>Access denied</html>' : XML, { headers: { "content-type": urls.length < 3 ? "text/html" : "application/xml" } });
    };
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await fetchBnrIntoCache(table, 2026, fetchMock)).toBe(true);
    expect(urls).toEqual(["https://www.bnr.ro/nbrfxrates.xml", "https://www.bnr.ro/nbrfxrates10days.xml", "https://www.bnr.ro/files/xml/years/nbrfxrates2026.xml"]);
    expect(table.rows).toHaveLength(2);
    expect(log.mock.calls[2]?.[1]).toMatchObject({ status: 200, contentType: "application/xml", preview: XML.slice(0, 300) });
    log.mockRestore();
  });
  it("parses real BNR namespace, whitespace and alternate attribute order", () => {
    expect(parseBnrYearXml(`<DataSet xmlns="http://www.bnr.ro/xsd"><Body><Cube other="x" date='2026-10-23'><Rate multiplier="1" currency = "EUR">\n 5.0871 \n</Rate></Cube></Body></DataSet>`)).toEqual([{day:"2026-10-23",eurRon:5.0871}]);
  });
  it("never overwrites an already saved historical rate", async () => {
    const fetch = vi.fn(async () => ({ rate: 99 }));
    expect(await resolveCommissionSaveRate("2026-10-23", { transaction_date: "2026-10-23", ron_to_eur_rate: 5.1 }, fetch)).toBe(5.1);
    expect(fetch).not.toHaveBeenCalled();
    const update = vi.fn(async () => {});
    expect(await completeMissingCommissionRates([{id:"saved",transaction_date:"2026-10-23",ron_to_eur_rate:5.1}], {resolve:fetch,update})).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });
});
