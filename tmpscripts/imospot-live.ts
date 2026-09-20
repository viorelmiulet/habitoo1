import { resolveImospotLocation } from "../src/lib/acp/market-query/imospot/locations";
import { buildImospotSearchUrl } from "../src/lib/acp/market-query/imospot/url";
import { parseImospotListings, parseImospotMarketContext } from "../src/lib/acp/market-query/imospot/parse";
import { marketQueryFetch } from "../src/lib/acp/market-query/fetch.server";

const loc = resolveImospotLocation({ city: "Bucuresti", zone: null });
console.log("location", loc);
const url = buildImospotSearchUrl({
  baseUrl: "https://www.imospot.ro",
  location: loc!,
  criteria: { transactionType: "sale", propertyType: "apartment", city: "Bucuresti", zone: null, rooms: 2, priceMin: null, priceMax: null, areaMin: null, areaMax: null } as never,
  page: 1,
});
console.log("url", url);
const res = await marketQueryFetch(url, { timeoutMs: 15000 });
console.log("status", res.status, "err", res.error, "len", res.body?.length);
if (res.body) {
  const listings = parseImospotListings(res.body, new Date());
  console.log("listings", listings.length, JSON.stringify(listings[0] ?? null));
  console.log("articles in html", (res.body.match(/<article/g) || []).length);
  console.log("data-listing-id", (res.body.match(/data-listing-id/g) || []).length);
  console.log("context", JSON.stringify(parseImospotMarketContext(res.body)));
}
