import { querySingleSource } from "../src/lib/acp/market-query/run.server";
import { marketQueryCriteria } from "../src/lib/acp/market-query/criteria";

const source = { key: "imospot", label: "Imospot.ro", baseUrl: "https://www.imospot.ro", enabled: true, timeoutMs: 8000, radiusKm: 5, priceBandPercent: 40 };
const subjects = [
  { name: "Bucuresti sector 6 ap 2 cam", s: { transactionType: "sale", propertyType: "apartment", city: "Bucuresti", county: "Bucuresti", neighborhood: "Sector 6", district: null, rooms: 2, price: 110000, usableArea: 50 } },
  { name: "Cluj-Napoca ap 3 cam", s: { transactionType: "sale", propertyType: "apartment", city: "Cluj-Napoca", county: "Cluj", neighborhood: null, district: null, rooms: 3, price: 180000, usableArea: 70 } },
  { name: "Brasov casa", s: { transactionType: "sale", propertyType: "house", city: "Brasov", county: "Brasov", neighborhood: null, district: null, rooms: 4, price: 250000, usableArea: 140 } },
];
for (const { name, s } of subjects) {
  const criteria = marketQueryCriteria(s as never, { radiusKm: source.radiusKm, priceBandPercent: source.priceBandPercent });
  const r = await querySingleSource({ source: source as never, criteria });
  console.log(name, "->", r.outcome.outcome, r.outcome.comparables, r.outcome.detail ?? "", r.requestedUrls[0]);
  if (r.comparables[0]) console.log("   ex:", r.comparables[0].price, r.comparables[0].currency, r.comparables[0].area, "m2", r.comparables[0].url);
  if (r.marketContext) console.log("   context linii:", r.marketContext.lines.length);
}
