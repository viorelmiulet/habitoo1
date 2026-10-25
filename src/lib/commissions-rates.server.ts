// Server-only exchange-rate cache (BNR first, ECB via Frankfurter as fallback) and missing-commission-rate completion.
export type RateSource = "BNR" | "BCE";
const BNR_HOSTS = ["https://curs.bnr.ro", "https://www.bnr.ro"] as const;
const BNR_HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36', Accept: 'application/xml' };

/** BNR feed URLs in priority order: curs.bnr.ro (current, 10-day, annual), then the legacy www.bnr.ro addresses. */
export function bnrFeedUrls(year: number): string[] {
  return BNR_HOSTS.flatMap(host => [
    `${host}/nbrfxrates.xml`,
    `${host}/nbrfxrates10days.xml`,
    `${host}/files/xml/years/nbrfxrates${year}.xml`,
  ]);
}

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

/** Frankfurter (ECB) JSON: for days without a published rate it returns the last published day. */
export function parseFrankfurterJson(text: string): { day: string; eurRon: number } | null {
  try {
    const data = JSON.parse(text) as { date?: unknown; rates?: { RON?: unknown } };
    const day = typeof data.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : null;
    const eurRon = Number(data.rates?.RON);
    if (!day || !Number.isFinite(eurRon) || eurRon <= 0) return null;
    return { day, eurRon };
  } catch { return null; }
}

export type ExchangeRatesTable = {
  select: (cols: string) => {
    lte: (col: string, v: string) => {
      order: (col: string, o: { ascending: boolean }) => {
        limit: (n: number) => PromiseLike<{ data: { day: string; eur_ron: number; source: string }[] | null; error?: { message: string } | null }>;
      };
    };
  };
  upsert: (rows: { day: string; eur_ron: number; source: string }[]) => PromiseLike<{ error: { message: string } | null }>;
};

async function fetchText(url: string, fetchImpl: typeof fetch, accept: string) {
  const res = await fetchImpl(url, { headers: { ...BNR_HEADERS, Accept: accept }, signal: AbortSignal.timeout(5000) });
  const text = await res.text();
  console.info('[rate source response]', { url, status: res.status, contentType: res.headers.get('content-type'), preview: text.slice(0, 300) });
  return res.ok ? text : "";
}

/** Try every BNR feed in order; on total failure fall back to the ECB rate for the requested date. Returns true when anything was cached. */
export async function fetchRatesIntoCache(table: ExchangeRatesTable, date: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const year = Number(date.slice(0, 4));
  for (const url of bnrFeedUrls(year)) {
    let rows: { day: string; eurRon: number }[];
    try { rows = parseBnrYearXml(await fetchText(url, fetchImpl, 'application/xml')); }
    catch (error) { console.warn('[BNR request failed]', { url, message: error instanceof Error ? error.message : 'request_failed' }); continue; }
    if (!rows.length) continue;
    const { error } = await table.upsert(rows.map(r => ({ day: r.day, eur_ron: r.eurRon, source: "BNR" })));
    if (error) throw new Error(error.message);
    return true;
  }
  const url = `https://api.frankfurter.app/${date}?from=EUR&to=RON`;
  try {
    const rate = parseFrankfurterJson(await fetchText(url, fetchImpl, 'application/json'));
    if (rate) {
      const { error } = await table.upsert([{ day: rate.day, eur_ron: rate.eurRon, source: "BCE" }]);
      if (error) throw new Error(error.message);
      return true;
    }
  } catch (error) { console.warn('[BCE request failed]', { url, message: error instanceof Error ? error.message : 'request_failed' }); }
  return false;
}

/** Latest published rate <= transaction date, including future dates. Never rewrite saved rates. */
export async function getRonEurRateForDate(date: string, deps: { table: ExchangeRatesTable; fetchImpl?: typeof fetch }): Promise<{ date: string; rateDate: string; rate: number; source: RateSource }> {
  const lookup = async () => {
    const { data, error } = await deps.table.select('day,eur_ron,source').lte('day', date).order('day', { ascending: false }).limit(1);
    if (error) throw new Error(error.message);
    return data?.[0] ?? null;
  };
  let row = await lookup();
  if (!row) {
    const fetched = await fetchRatesIntoCache(deps.table, date, deps.fetchImpl);
    row = await lookup();
    // Current/10-day data may not cover a historical transaction. Fetch the previous annual file next.
    if (!row && fetched) {
      const year = Number(date.slice(0, 4)) - 1;
      for (const url of BNR_HOSTS.map(host => `${host}/files/xml/years/nbrfxrates${year}.xml`)) {
        try {
          const rates = parseBnrYearXml(await fetchText(url, deps.fetchImpl ?? fetch, 'application/xml'));
          if (rates.length) {
            const { error } = await deps.table.upsert(rates.map(r => ({ day: r.day, eur_ron: r.eurRon, source: "BNR" })));
            if (error) throw new Error(error.message);
          }
        } catch (error) { console.warn('[BNR annual failed]', error instanceof Error ? error.message : 'request_failed'); }
        row = await lookup();
        if (row) break;
      }
    }
  }
  if (!row) throw new Error('Nu am găsit cursul pentru această dată');
  return { date, rateDate: row.day, rate: Number(row.eur_ron), source: row.source === "BCE" ? "BCE" : "BNR" };
}

export type MissingRateRow = { id: string; transaction_date: string; ron_to_eur_rate: number | null };
/** Shared by caller-RLS completion and the authenticated daily callback; failures remain retryable. */
export async function completeMissingCommissionRates(rows: MissingRateRow[], deps: {
  resolve: (date: string) => Promise<{ rate: number; source: RateSource }>;
  update: (ids: string[], date: string, rate: number, source: RateSource) => Promise<void>;
}) {
  let updated = 0;
  for (const date of new Set(rows.filter(r => r.ron_to_eur_rate == null).map(r => r.transaction_date))) {
    let resolved: { rate: number; source: RateSource };
    try { resolved = await deps.resolve(date); }
    catch (error) { console.warn('[rate completion deferred]', { date, message: error instanceof Error ? error.message : 'unavailable' }); continue; }
    const ids = rows.filter(r => r.transaction_date === date && r.ron_to_eur_rate == null).map(r => r.id);
    await deps.update(ids, date, resolved.rate, resolved.source);
    updated += ids.length;
  }
  return updated;
}
