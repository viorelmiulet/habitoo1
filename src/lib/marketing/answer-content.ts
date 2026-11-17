import { FEATURE_PAGES } from "./feature-pages";
import { INTEGRATION_PAGES, DYNAMIC_INTEGRATION_PAGES } from "@/lib/portals/integration-pages";

export const MAIN_ANSWERS: Record<string, string> = {
  "/preturi": "Habitoo CRM oferă planurile Basic, Pro și Unlimited pentru agențiile imobiliare, cu abonamente lunare sau anuale. Alegi planul în funcție de numărul de agenți și de instrumentele de care ai nevoie. Plata anuală are o reducere de 50%. Activarea abonamentului se face pe factură, fără plată online.",
  "/anunturi-proprietari": "Habitoo adună anunțurile de la proprietari din Storia, OLX, Romimo, Imoradar24 și Anuntul.ro într-o listă filtrabilă pe județ, oraș și cartier. Vezi ofertele din zona ta fără să deschizi fiecare portal separat. Importul în portofoliu necesită acordul proprietarului, creează o ciornă și nu publică automat anunțul.",
  "/analiza-comparativa-de-piata": "Analiza comparativă de piață din Habitoo compară proprietatea cu ofertele similare ale agenției, partenerilor și pieței. Calculul folosește ponderi fixe, ajustări explicate și prețurile cerute în anunțuri, nu tranzacții confirmate. Obții un interval de preț și un raport PDF. Comentariul AI opțional nu schimbă valorile calculate.",
  "/colaborare-intre-agentii": "Colaborarea din Habitoo permite agențiilor participante să ofere proprietăți partenerilor, cu comisionul stabilit de agenție. Agenții pot propune clienți și discuta privat, fără expunerea proprietarului. Alegi ofertele disponibile pentru colaborare și poți opri participarea. Habitoo nu încasează și nu împarte comisioanele și nu înlocuiește contractul dintre agenții.",
  "/comisioane-agenti-imobiliari": "Habitoo păstrează evidența comisionului agenției și a sumei agentului pentru fiecare tranzacție. Agentul vede propriile comisioane, iar administratorul urmărește întreaga agenție. Înregistrezi manual sumele, moneda și starea, apoi folosești rapoarte și exporturi Excel, CSV sau PDF. Conversiile folosesc cursul păstrat pentru tranzacție, fără schimbarea valorilor istorice.",
  "/import-proprietati": "Importul din Habitoo aduce proprietăți din IMMOFLUX cu fotografii și caracteristici sau din lista Anunțuri particulari, după confirmarea acordului proprietarului. Ofertele importate intră în portofoliul agenției ca ciorne și nu sunt publicate automat. Verifici datele și fotografiile înainte de utilizare, iar importul particularilor previne dublurile în aceeași agenție.",
  "/extensie-chrome": "Habitoo Catch este extensia Chrome care importă anunțul ales de pe OLX, Storia, Publi24 sau Imobiliare.ro în Habitoo. Poți pregăti și postări ale ofertelor tale în grupuri Facebook, cu numele și telefonul din profil. Tu alegi anunțul și confirmi acțiunea; importul nu publică automat proprietatea pe portaluri.",
};

/** Complete sentences taken from existing editorial introductions, never an AI rewrite. */
export function conciseAnswer(paragraphs: string[]): string {
  const sentences = paragraphs.join(" ").match(/[^.!?]+[.!?](?:\s|$)/g) ?? paragraphs;
  let answer = "";
  for (const sentence of sentences) {
    const next = `${answer} ${sentence.trim()}`.trim();
    if (next.split(/\s+/).length > 60) break;
    answer = next;
    if (answer.split(/\s+/).length >= 40) break;
  }
  return answer;
}
export function answerForPath(path: string): string | undefined {
  if (MAIN_ANSWERS[path]) return MAIN_ANSWERS[path];
  const slug = path.split("/")[2];
  const page = path.startsWith("/functionalitati/") ? FEATURE_PAGES.find(p => p.slug === slug)
    : path.startsWith("/integrari/") ? [...INTEGRATION_PAGES, ...DYNAMIC_INTEGRATION_PAGES].find(p => p.slug === slug) : null;
  return page ? conciseAnswer(page.intro) : undefined;
}