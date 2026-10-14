/**
 * Adaptorul ImoBox.ro pentru portul `market_query`: API JSON public, fără cheie.
 * Cel mult 3 pagini a câte 100 de rezultate; sub 5 rezultate utile se reîncearcă
 * fără zonă, doar cu orașul. Nimic nu se stochează în afara analizei.
 */
import { marketQueryFetch, type MarketQueryFetchResult } from "../fetch.server";
import type { MarketQueryAdapter, MarketQueryAdapterResult, MarketQueryRawComparable } from "../port";
import {
  buildImoboxQuery,
  buildImoboxUrl,
  IMOBOX_MAX_PAGES,
  IMOBOX_MIN_RESULTS,
  IMOBOX_SOURCE_KEY,
  IMOBOX_USER_AGENT,
  imoboxExclusion,
  mapImoboxResult,
  parseImoboxPage,
} from "./query";

export { IMOBOX_SOURCE_KEY };

type FetchPage = (
  url: string,
  options: { timeoutMs?: number; userAgent?: string },
) => Promise<MarketQueryFetchResult>;

export function createImoboxAdapter(deps: { fetchPage?: FetchPage; now?: () => Date } = {}): MarketQueryAdapter {
  const fetchPage: FetchPage = deps.fetchPage ?? marketQueryFetch;
  const now = deps.now ?? (() => new Date());

  return {
    key: IMOBOX_SOURCE_KEY,
    async query({ criteria, source, signal }): Promise<MarketQueryAdapterResult> {
      if (!criteria.city) throw new Error("Proprietatea nu are oraș; ImoBox nu a fost întrebat.");
      const items: MarketQueryRawComparable[] = [];
      const seen = new Set<string>();
      const requestedUrls: string[] = [];
      let found = 0;
      let excluded = 0;
      let pagesUsed = 0;
      const at = now();

      const run = async (q: string) => {
        for (let page = 1; page <= IMOBOX_MAX_PAGES && pagesUsed < IMOBOX_MAX_PAGES; page += 1) {
          if (signal.aborted) throw new Error("Interogare întreruptă.");
          const url = buildImoboxUrl(source.baseUrl, q, page);
          requestedUrls.push(url);
          pagesUsed += 1;
          const aborted = new Promise<never>((_, reject) => {
            signal.addEventListener("abort", () => reject(new Error("Interogare întreruptă.")), { once: true });
          });
          const result = await Promise.race([
            fetchPage(url, { timeoutMs: source.timeoutMs, userAgent: IMOBOX_USER_AGENT }),
            aborted,
          ]);
          if (result.error) throw new Error(result.error);
          if (result.status !== 200 || !result.body) {
            throw new Error(`Răspuns neutilizabil de la ImoBox (${result.status}).`);
          }
          let parsed;
          try {
            parsed = parseImoboxPage(result.body);
          } catch {
            throw new Error("ImoBox a trimis un răspuns care nu e JSON.");
          }
          for (const r of parsed.results) {
            const mapped = mapImoboxResult(r);
            const key = mapped.id ?? String(mapped.url ?? "");
            if (key && seen.has(key)) continue;
            if (key) seen.add(key);
            found += 1;
            if (imoboxExclusion(r, criteria, at)) {
              excluded += 1;
              continue;
            }
            const { id: _id, ...raw } = mapped;
            items.push(raw);
          }
          if (parsed.results.length === 0) break;
          if (parsed.totalPages !== null && page >= parsed.totalPages) break;
        }
      };

      await run(buildImoboxQuery(criteria, { withZone: true }));
      if (items.length < IMOBOX_MIN_RESULTS && criteria.zone && pagesUsed < IMOBOX_MAX_PAGES) {
        await run(buildImoboxQuery(criteria, { withZone: false }));
      }

      return {
        items,
        requestedUrls,
        detail: `Găsite ${found}, folosite ${items.length}, excluse ${excluded}.`,
      };
    },
  };
}

export const imoboxAdapter = createImoboxAdapter();
