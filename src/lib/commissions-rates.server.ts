// Cursuri BNR RON/EUR — doar pe server. Sursa: fișierul XML anual BNR
// (https://www.bnr.ro/files/xml/years/nbrfxrates{YYYY}.xml); cursurile se
// păstrează în public.exchange_rates ca să nu cerem BNR la fiecare raport.

const BNR_YEAR_URL = (year: number) => `https://www.bnr.ro/files/xml/years/nbrfxrates${year}.xml`;
const MAX_LOOKBACK_DAYS = 14;

/** Extrage cursurile EUR din XML-ul anual BNR (fără DOM parser — rulează pe workerd). */
export function parseBnrYearXml(xml: string): { day: string; eurRon: number }[] {
  const out: { day: string; eurRon: number }[] = [];
  const cubeRe = /<Cube date="(\d{4}-\d{2}-\d{2})"[^>]*>([\s\S]*?)<\/Cube>/g;
  let m: RegExpExecArray | null;
  while ((m = cubeRe.exec(xml))) {
    const rate = /<Rate currency="EUR"[^>]*>([\d.]+)<\/Rate>/.exec(m[2]);
    const eurRon = rate ? Number(rate[1]) : NaN;
    if (Number.isFinite(eurRon) && eurRon > 0) out.push({ day: m[1], eurRon });
  }
  return out;
}

type ExchangeRatesTable = {
  select: (cols: string) => {
    lte: (col: string, v: string) => {
      gte: (col: string, v: string) => {
        order: (col: string, o: { ascending: boolean }) => {
          limit: (n: number) => Promise<{ data: { day: string; eur_ron: number }[] | null }>;
        };
      };
    };
  };
  upsert: (rows: { day: string; eur_ron: number }[]) => Promise<{ error: { message: string } | null }>;
};

const dayBefore = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

async function fetchYearIntoCache(table: ExchangeRatesTable, year: number, fetchImpl: typeof fetch) {
  const res = await fetchImpl(BNR_YEAR_URL(year));
  if (!res.ok) throw new Error(`BNR a răspuns ${res.status}`);
  const rows = parseBnrYearXml(await res.text());
  if (rows.length === 0) throw new Error("BNR nu a returnat cursuri");
  const { error } = await table.upsert(rows.map((r) => ({ day: r.day, eur_ron: r.eurRon })));
  if (error) throw new Error(error.message);
}

/**
 * Cursul BNR RON/EUR pentru o dată. BNR publică doar în zilele lucrătoare,
 * deci pentru weekend/sărbători se folosește ultimul curs publicat anterior
 * (maxim 14 zile înapoi). Cache-ul local e completat din fișierul anual BNR.
 */
export async function getRonEurRateForDate(
  date: string,
  deps: { table: ExchangeRatesTable; fetchImpl?: typeof fetch },
): Promise<{ date: string; rateDate: string; rate: number }> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const lookup = async () => {
    const { data } = await deps.table
      .select("day,eur_ron")
      .lte("day", date)
      .gte("day", dayBefore(date, MAX_LOOKBACK_DAYS))
      .order("day", { ascending: false })
      .limit(1);
    return data?.[0] ?? null;
  };

  let row = await lookup();
  if (!row) {
    await fetchYearIntoCache(deps.table, Number(date.slice(0, 4)), fetchImpl);
    row = await lookup();
  }
  if (!row) throw new Error("Nu am găsit cursul BNR pentru această dată");
  return { date, rateDate: row.day, rate: Number(row.eur_ron) };
}
