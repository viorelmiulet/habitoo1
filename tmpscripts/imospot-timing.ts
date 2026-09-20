import { marketQueryFetch, clearMarketQueryRobotsCache } from "../src/lib/acp/market-query/fetch.server";
const url = "https://www.imospot.ro/toate-ofertele-din-bucuresti?tranzactie=vanzari&categorie=apartamente-de-vanzare&sort=-cele-mai-noi";
clearMarketQueryRobotsCache();
for (const t of [4000, 4000, 8000]) {
  const s = Date.now();
  const r = await marketQueryFetch(url, { timeoutMs: t });
  console.log("timeout", t, "ms elapsed", Date.now() - s, "status", r.status, "err", r.error);
}
