// Server-only BNR cache and missing-commission-rate completion.
const BNR_YEAR_URL = (year: number) => `https://www.bnr.ro/files/xml/years/nbrfxrates${year}.xml`;
const BNR_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36', Accept: 'application/xml' };

/** BNR Cube date / Rate currency=EUR, independent of attribute order and whitespace. */
export function parseBnrYearXml(xml: string): { day: string; eurRon: number }[] {
  const out: { day: string; eurRon: number }[] = [];
  for (const cube of xml.matchAll(/<Cube\b([^>]*)>([\s\S]*?)<\/Cube\s*>/gi)) {
    const day = /\bdate\s*=\s*["'](\d{4}-\d{2}-\d{2})["']/i.exec(cube[1])?.[1];
    if (!day) continue;
    for (const rate of cube[2].matchAll(/<Rate\b([^>]*)>\s*([\d.]+)\s*<\/Rate\s*>/gi)) {
      if (!/\bcurrency\s*=\s*["']EUR["']/i.test(rate[1])) continue;
      const multiplier = Number(/\bmultiplier\s*=\s*["'](\d+)["']/i.exec(rate[1])?.[1] ?? 1);
      const eurRon = Number(rate[2]) / multiplier;
      if (Number.isFinite(eurRon) && eurRon > 0) out.push({ day, eurRon });
    }
  }
  return out;
}

export type ExchangeRatesTable = {
  select: (cols: string) => {
    lte: (col: string, v: string) => {
      order: (col: string, o: { ascending: boolean }) => {
        limit: (n: number) => PromiseLike<{ data: { day: string; eur_ron: number }[] | null; error?: { message: string } | null }>;
      };
    };
  };
  upsert: (rows: { day: string; eur_ron: number }[]) => PromiseLike<{ error: { message: string } | null }>;
};

export async function fetchBnrIntoCache(table: ExchangeRatesTable, year: number, fetchImpl: typeof fetch = fetch) {
  for (const url of ['https://www.bnr.ro/nbrfxrates.xml', 'https://www.bnr.ro/nbrfxrates10days.xml', BNR_YEAR_URL(year)]) {
    let rows: { day: string; eurRon: number }[];
    try {
      const res = await fetchImpl(url, { headers: BNR_HEADERS, signal: AbortSignal.timeout(5000) });
      const text = await res.text();
      console.info('[BNR response]', { url, status: res.status, contentType: res.headers.get('content-type'), preview: text.slice(0, 300) });
      rows = res.ok ? parseBnrYearXml(text) : [];
    } catch (error) {
      console.warn('[BNR request failed]', { url, message: error instanceof Error ? error.message : 'request_failed' });
      continue;
    }
    if (!rows.length) continue;
    const { error } = await table.upsert(rows.map(r => ({ day: r.day, eur_ron: r.eurRon })));
    if (error) throw new Error(error.message);
    return true;
  }
  return false;
}

/** Latest published rate <= transaction date, including future dates. Never rewrite saved rates. */
export async function getRonEurRateForDate(date: string, deps: { table: ExchangeRatesTable; fetchImpl?: typeof fetch }): Promise<{ date: string; rateDate: string; rate: number }> {
  const lookup = async () => {
    const { data, error } = await deps.table.select('day,eur_ron').lte('day', date).order('day', { ascending: false }).limit(1);
    if (error) throw new Error(error.message);
    return data?.[0] ?? null;
  };
  let row = await lookup();
  if (!row) {
    await fetchBnrIntoCache(deps.table, Number(date.slice(0, 4)), deps.fetchImpl);
    row = await lookup();
    // Current/10-day data may not cover a historical transaction. Fetch its year next.
    if (!row) {
      const year = Number(date.slice(0, 4));
      for (const y of [year, year - 1]) {
        const url = BNR_YEAR_URL(y);
        try {
          const res = await (deps.fetchImpl ?? fetch)(url, { headers: BNR_HEADERS, signal: AbortSignal.timeout(5000) });
          const text = await res.text();
          console.info('[BNR annual response]', { url, status: res.status, contentType: res.headers.get('content-type'), preview: text.slice(0, 300) });
          const rates = res.ok ? parseBnrYearXml(text) : [];
          if (rates.length) {
            const { error } = await deps.table.upsert(rates.map(r => ({ day: r.day, eur_ron: r.eurRon })));
            if (error) throw new Error(error.message);
          }
        } catch (error) { console.warn('[BNR annual failed]', error instanceof Error ? error.message : 'request_failed'); }
        row = await lookup();
        if (row) break;
      }
    }
  }
  if (!row) throw new Error('Nu am găsit cursul BNR pentru această dată');
  return { date, rateDate: row.day, rate: Number(row.eur_ron) };
}

export type MissingRateRow = { id: string; transaction_date: string; ron_to_eur_rate: number | null };
/** Shared by caller-RLS completion and the authenticated daily callback; failures remain retryable. */
export async function completeMissingCommissionRates(rows: MissingRateRow[], deps: {
  resolve: (date: string) => Promise<{ rate: number }>;
  update: (ids: string[], date: string, rate: number) => Promise<void>;
}) {
  let updated = 0;
  for (const date of new Set(rows.filter(r => r.ron_to_eur_rate == null).map(r => r.transaction_date))) {
    let rate: number;
    try { rate = (await deps.resolve(date)).rate; }
    catch (error) { console.warn('[BNR completion deferred]', { date, message: error instanceof Error ? error.message : 'unavailable' }); continue; }
    const ids = rows.filter(r => r.transaction_date === date && r.ron_to_eur_rate == null).map(r => r.id);
    await deps.update(ids, date, rate);
    updated += ids.length;
  }
  return updated;
}
