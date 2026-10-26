import type { LlmsStatistics } from "@/lib/blog-discovery";
import { ACP_SCORE_COMPONENTS, ACP_SCORE_LABELS, ACP_SCORE_WEIGHTS, ACP_THRESHOLDS } from "@/lib/acp/config";
import type { FaqItem } from "./FaqSection";

export const PUBLIC_ACP_PATH = "/analiza-comparativa-de-piata";
export const PUBLIC_ACP_TITLE = "Analiză comparativă de piață (ACP) pentru agenții | Habitoo CRM";
export const PUBLIC_ACP_DESCRIPTION = "Estimează prețul unei proprietăți din oferte reale: scor de similaritate, ajustări explicate, interval de preț, încredere și raport PDF pentru client.";

export function publicAcpScoring() {
  return {
    components: ACP_SCORE_COMPONENTS.map((key) => ({ key, label: ACP_SCORE_LABELS[key], weight: ACP_SCORE_WEIGHTS[key] })),
    direct: ACP_THRESHOLDS.direct,
    secondary: ACP_THRESHOLDS.secondary,
  };
}

export function summarizePublicMarket(statistics: LlmsStatistics, observedAt: string) {
  const date = new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Bucharest" }).format(new Date(observedAt));
  return { date, total: statistics.market_active };
}

export function publicMarketText(statistics: LlmsStatistics | null, observedAt: string) {
  if (!statistics) return "ACP folosește ofertele de piață active; cifrele actualizate nu sunt disponibile momentan.";
  const { date, total } = summarizePublicMarket(statistics, observedAt);
  return `La ${date}: ${total} oferte de piață active.`;
}

export function publicAcpFaq(statisticsText: string): FaqItem[] {
  return [
    { q: "Cum calculează Habitoo prețul recomandat?", a: "Din prețurile ajustate ale comparabilelor folosite, plus marja de negociere; fiecare comparabil are scorul și ajustările vizibile." },
    { q: "Câte oferte de piață folosește ACP?", a: `${statisticsText} Pentru o analiză se iau cele mai recente 400 de oferte potrivite ca tip, tranzacție și oraș.` },
    { q: "Este ACP o evaluare oficială?", a: "Nu. Este o analiză de piață pentru stabilirea prețului de listare; evaluarea pentru bănci se face de un evaluator autorizat ANEVAR." },
    { q: "Pot scoate un comparabil care nu se potrivește?", a: "Da, cu „Exclude”; analiza se recalculează și rămâne salvată ca versiune nouă." },
    { q: "Pot da clientului un raport?", a: "Da, un PDF generat dintr-o versiune a analizei, cu cifrele înghețate la data generării." },
  ];
}