import type { LlmsStatistics } from "@/lib/blog-discovery";
import { marketSourceName } from "@/lib/market/sources";
import type { FaqItem } from "./FaqSection";

export const OWNER_LISTINGS_PATH = "/anunturi-proprietari";
export const OWNER_LISTINGS_TITLE = "Anunțuri de la proprietari pentru agenții imobiliare | Habitoo CRM";
export const OWNER_LISTINGS_DESCRIPTION = "Anunțurile de la proprietari din Storia, OLX, Romimo, Imoradar24 și Anuntul.ro, într-o singură listă, cu filtre pe zone și import în portofoliu.";

export function summarizeOwnerStatistics(statistics: LlmsStatistics, observedAt: string) {
  const sources = statistics.owner_sources.filter((row) => row.count > 0 && row.source !== "facebook");
  const date = new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Bucharest" }).format(new Date(observedAt));
  const total = sources.reduce((sum, row) => sum + row.count, 0);
  return { sources, date, total };
}

export function ownerStatisticsText(statistics: LlmsStatistics, observedAt: string) {
  const { sources, date, total } = summarizeOwnerStatistics(statistics, observedAt);
  return `La ${date}: ${total} anunțuri de la proprietari din ${sources.length} surse: ${sources.map((row) => `${marketSourceName(row.source)} (${row.count})`).join(", ") || "niciuna"}.`;
}

export function ownerListingsFaq(statisticsText: string): FaqItem[] {
  return [
    { q: "Câte anunțuri de la proprietari sunt în Habitoo și de unde vin?", a: statisticsText },
    { q: "Cât de des se actualizează lista?", a: "La fiecare 30 de minute pentru majoritatea surselor." },
    { q: "Pot vedea telefonul proprietarului?", a: "De regulă nu. Prin Argus, cu abonament propriu, la cerere." },
    { q: "Cum import un anunț în portofoliu?", a: "Cu „Importă în portofoliu”, după confirmarea acordului proprietarului; proprietatea apare ca ciornă." },
    { q: "Pot filtra pe sector și cartier în București?", a: "Da, cu mai multe zone deodată, grupate pe sectoare." },
  ];
}