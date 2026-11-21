import { PLAN_AGENT_LIMITS, PLAN_KEYS, PLAN_LABELS, PLAN_PRICES, type PlanKey } from "@/lib/plans";

export type ComparisonFaq = { q: string; a: string };

/** Smallest plan whose agent limit covers the team. */
export function planForAgents(agents: number): PlanKey {
  const n = Math.max(1, Math.floor(agents));
  return PLAN_KEYS.find((key) => { const limit = PLAN_AGENT_LIMITS[key]; return limit === null || n <= limit; }) ?? "unlimited";
}

export type CostComparison = {
  agents: number; pricePerAgent: number; currentMonthly: number; currentAnnual: number;
  plan: PlanKey; planLabel: string; habitooMonthly: number; habitooAnnualMonthlyBilling: number; habitooAnnual: number;
  annualSavings: number;
};

export function compareCost(agents: number, pricePerAgent: number): CostComparison {
  const a = Math.max(1, Math.floor(Number.isFinite(agents) ? agents : 1));
  const p = Math.max(0, Number.isFinite(pricePerAgent) ? pricePerAgent : 0);
  const plan = planForAgents(a);
  const price = PLAN_PRICES[plan];
  const currentMonthly = Math.round(a * p * 100) / 100;
  const currentAnnual = Math.round(currentMonthly * 12 * 100) / 100;
  const habitooAnnual = price.annualMonthly * 12;
  return { agents: a, pricePerAgent: p, currentMonthly, currentAnnual, plan, planLabel: PLAN_LABELS[plan], habitooMonthly: price.monthly, habitooAnnualMonthlyBilling: price.monthly * 12, habitooAnnual, annualSavings: Math.round((currentAnnual - habitooAnnual) * 100) / 100 };
}

export const CALCULATOR_EXAMPLE = { agents: 8, pricePerAgent: 20 } as const;

export type ComparisonLinkPath = "/integrari" | "/preturi" | "/import-proprietati" | "/comisioane-agenti-imobiliari" | "/colaborare-intre-agentii" | "/functionalitati/contracte" | "/functionalitati/ansambluri-rezidentiale" | "/functionalitati/aplicatie-mobil" | "/functionalitati" | "/dezvoltatori" | "/functionalitati/echipa-si-roluri";
export type ChecklistItem = { title: string; text: string; habitoo: string; to: ComparisonLinkPath; linkLabel: string };

export const COMPARISON_HUB = {
  path: "/comparatie",
  title: "Cum alegi un CRM imobiliar: ghid și listă de verificare",
  seoTitle: "Cum alegi un CRM imobiliar: listă de verificare",
  description: "Ghid pentru alegerea unui CRM imobiliar: publicarea pe portaluri, prețul pe agenție sau pe agent, perioada de probă, importul, exportul și drepturile agenților.",
  intro: "Un CRM imobiliar bun îți publică anunțurile pe portaluri dintr-un singur loc, îți păstrează clienții și cererile în ordine și are un preț care nu crește cu fiecare agent nou. Înainte să alegi, verifică cum se face publicarea, cum se calculează prețul și dacă îți poți muta și scoate datele ușor. Lista de mai jos te ajută să compari pe criterii concrete.",
  checklist: [
    { title: "Publicarea pe portaluri", text: "Verifică pe câte portaluri poți publica și dacă publicarea se face direct din CRM sau prin copiere manuală.", habitoo: "bifezi portalurile pe fiecare proprietate, iar anunțul se publică, se actualizează și se retrage automat.", to: "/integrari", linkLabel: "Integrări cu portalurile" },
    { title: "Modelul de preț", text: "Un preț pe agent crește cu fiecare om nou din echipă; un preț pe agenție rămâne fix în limita planului.", habitoo: "plătești pe agenție, cu planurile Basic, Pro și Unlimited.", to: "/preturi", linkLabel: "Prețuri" },
    { title: "Perioada de probă", text: "Un test cu toată echipa, pe date reale, arată mai mult decât o demonstrație.", habitoo: "agențiile noi primesc 90 de zile de acces gratuit, fără card bancar.", to: "/preturi", linkLabel: "Planuri și perioada de probă" },
    { title: "Importul din alt CRM", text: "Întreabă dacă proprietățile intră cu fotografii și caracteristici și dacă importul evită dublurile.", habitoo: "proprietățile se importă cu fotografii, caracteristici și locație, ca ciorne, fără publicare automată.", to: "/import-proprietati", linkLabel: "Import proprietăți" },
    { title: "Exportul datelor", text: "Datele agenției trebuie să poată ieși din CRM când ai nevoie de ele.", habitoo: "exporți lista de proprietăți filtrată în CSV, iar rapoartele de comisioane în Excel, CSV sau PDF.", to: "/comisioane-agenti-imobiliari", linkLabel: "Comisioane și exporturi" },
    { title: "Colaborarea între agenții", text: "Verifică dacă poți oferi proprietăți altor agenții fără să expui proprietarul.", habitoo: "oferi proprietăți partenerilor cu comisionul stabilit de agenție și discuți în conversații private.", to: "/colaborare-intre-agentii", linkLabel: "Colaborare între agenții" },
    { title: "Contractele", text: "Contractele generate din CRM economisesc timp și păstrează numerotarea în ordine.", habitoo: "generezi contracte din datele clientului și ale proprietății, cu seria și numărul de start alese de agenție pentru contractele de comision, vizionare și reprezentare exclusivă.", to: "/functionalitati/contracte", linkLabel: "Contracte" },
    { title: "Ansamblurile rezidențiale", text: "Dacă lucrezi cu dezvoltatori, ai nevoie de unități grupate pe ansamblu și publicate separat.", habitoo: "aloci unități în ansambluri, alegi portalurile pentru fiecare ansamblu și publici investiții pe Storia.", to: "/functionalitati/ansambluri-rezidentiale", linkLabel: "Ansambluri rezidențiale" },
    { title: "Aplicația pe telefon", text: "Agenții lucrează pe teren, deci CRM-ul trebuie să meargă bine pe telefon.", habitoo: "folosești aplicația pe telefon pentru proprietăți, clienți și activități.", to: "/functionalitati/aplicatie-mobil", linkLabel: "Aplicație pe mobil" },
    { title: "Funcțiile AI", text: "Verifică ce face concret AI-ul și cât costă folosirea lui.", habitoo: "creezi anunțuri din poze și voce și ai credite AI lunare incluse în fiecare plan.", to: "/functionalitati", linkLabel: "Funcționalități" },
    { title: "Accesul portalurilor partenere", text: "Un acces documentat pentru portaluri și site-ul agenției evită exporturile manuale.", habitoo: "portalurile partenere și site-ul agenției primesc anunțurile prin Partner API și feed documentate public.", to: "/dezvoltatori", linkLabel: "Documentație API" },
    { title: "Drepturile agenților", text: "Fiecare agent ar trebui să vadă și să modifice doar ce îi permite rolul.", habitoo: "stabilești roluri pentru administratori, manageri și agenți, iar mutarea proprietăților o fac doar administratorii.", to: "/functionalitati/echipa-si-roluri", linkLabel: "Echipă și roluri" },
  ] satisfies ChecklistItem[],
  faq: [
    { q: "Ce criterii contează cel mai mult la un CRM imobiliar?", a: "Publicarea pe portaluri din CRM, modelul de preț, importul și exportul datelor și drepturile agenților. Ele îți arată cât timp economisești și cât te costă pe măsură ce crește echipa." },
    { q: "E mai bun prețul pe agenție sau prețul pe agent?", a: "Prețul pe agent e simplu pentru echipe foarte mici, dar crește cu fiecare agent nou. Prețul pe agenție rămâne fix în limita planului. Calculatorul nostru îți arată diferența pentru echipa ta." },
    { q: "Pot testa Habitoo înainte să plătesc?", a: "Da. Orice agenție nouă primește 90 de zile de acces gratuit, fără card bancar, cu toată echipa." },
    { q: "Îmi pot muta proprietățile în Habitoo?", a: "Da. Proprietățile se importă cu fotografii, caracteristici și locație, ca ciorne, fără dubluri și fără publicare automată pe portaluri." },
    { q: "Habitoo funcționează pe telefon?", a: "Da. Aplicația funcționează pe telefon pentru proprietăți, clienți, cereri și activități." },
    { q: "Pot alege pe ce portaluri public fiecare anunț?", a: "Da. Bifezi portalurile pe fiecare proprietate, iar debifarea retrage anunțul de pe portalul respectiv." },
  ] satisfies ComparisonFaq[],
};

export const COST_CALCULATOR = {
  path: "/comparatie/cost-crm-pe-agentie-vs-pe-agent",
  title: "Cost CRM imobiliar: preț pe agenție vs preț pe agent",
  seoTitle: "Cost CRM: preț pe agenție vs pe agent | Calculator",
  description: "Calculează cât plătești acum pentru CRM-ul imobiliar cu preț pe agent și compară cu planul Habitoo potrivit, lunar și anual, cu 50% reducere la plata anuală.",
  intro: "Introdu numărul de agenți și prețul pe agent pe lună pe care îl plătești acum. Calculatorul îți arată costul lunar și anual actual și îl compară cu planul Habitoo potrivit echipei tale.",
  explanation: [
    "La prețul pe agent plătești o sumă pentru fiecare utilizator. Costul crește de fiecare dată când angajezi un agent nou sau adaugi un colaborator.",
    "La prețul pe agenție plătești un abonament pentru toată agenția, în limita de agenți a planului. Costul rămâne același cât timp echipa încape în plan, iar Unlimited nu are limită de agenți.",
  ],
  faq: [
    { q: "Cum aleg planul Habitoo potrivit?", a: "Planul depinde de numărul de agenți: Basic pentru până la 3 agenți, Pro pentru până la 10 agenți și Unlimited fără limită de agenți." },
    { q: "Cât economisesc la plata anuală?", a: "La plata anuală prețul lunar echivalent scade cu 50% față de plata lunară, pentru toate planurile." },
    { q: "Prețurile includ toate funcțiile?", a: "Toate planurile includ modulele de bază ale CRM-ului. Diferențele țin de dimensiunea echipei, de nevoile de configurare și de suport." },
    { q: "Calculatorul ține cont de perioada de probă?", a: "Nu. Calculatorul compară abonamentele. Agențiile noi primesc în plus 90 de zile de acces gratuit, fără card bancar." },
    { q: "În ce monedă sunt prețurile?", a: "Prețurile Habitoo sunt în euro. Introdu și prețul actual în euro pe agent pe lună, ca rezultatul să fie comparabil." },
  ] satisfies ComparisonFaq[],
};

export const ALTERNATIVE_PAGE = {
  path: "/alternative",
  title: "Schimbi CRM-ul imobiliar? Cum treci la Habitoo",
  seoTitle: "Schimbi CRM-ul imobiliar? Cum treci la Habitoo",
  description: "Cum treci la Habitoo CRM: importi proprietățile cu poze, inviți echipa, activezi portalurile și testezi 90 de zile gratuit. Ce se păstrează și ce verifici.",
  intro: "Treci la Habitoo în patru pași: importi proprietățile cu poze, inviți echipa, activezi portalurile și folosești perioada de probă de 90 de zile ca să verifici totul pe date reale. Proprietățile importate intră ca ciorne, deci nimic nu se publică până nu decizi tu.",
  steps: [
    { title: "1. Importă proprietățile cu poze", text: "Proprietățile intră în Habitoo cu fotografii, caracteristici și locație. Importul evită dublurile, iar proprietățile rămân ciorne până le verifici.", to: "/import-proprietati", linkLabel: "Import proprietăți" },
    { title: "2. Invită echipa", text: "Trimite invitații agenților și stabilește rolurile: administrator, manager sau agent. Fiecare vede și modifică doar ce îi permite rolul.", to: "/functionalitati/echipa-si-roluri", linkLabel: "Echipă și roluri" },
    { title: "3. Activează portalurile", text: "Conectează conturile de portal ale agenției și bifează portalurile pe fiecare proprietate. Publicarea, actualizarea și retragerea se fac din CRM.", to: "/integrari", linkLabel: "Integrări cu portalurile" },
    { title: "4. Folosește perioada de probă", text: "Ai 90 de zile de acces gratuit, fără card bancar, ca să lucrezi cu toată echipa. La final alegi planul potrivit.", to: "/preturi", linkLabel: "Prețuri" },
  ] satisfies { title: string; text: string; to: ComparisonLinkPath; linkLabel: string }[],
  kept: [
    "Fotografiile, caracteristicile și locația proprietăților importate.",
    "Proprietățile rămân ciorne, fără publicare automată pe portaluri.",
    "Importul repetat nu creează dubluri.",
  ],
  check: [
    "Prețurile, descrierile și datele de contact ale proprietarilor, înainte de publicare.",
    "Agentul responsabil al fiecărei proprietăți.",
    "Conturile de portal ale agenției și portalurile bifate pe fiecare anunț.",
    "Anunțurile încă active din vechiul sistem, ca să nu apară de două ori pe același portal.",
  ],
  faq: [
    { q: "Se publică automat proprietățile importate?", a: "Nu. Proprietățile importate intră ca ciorne și se publică doar când bifezi portalurile." },
    { q: "Se păstrează fotografiile?", a: "Da. Proprietățile se importă cu fotografii, caracteristici și locație." },
    { q: "Ce se întâmplă dacă import de două ori?", a: "Importul evită dublurile, așa că aceeași proprietate nu apare de două ori în portofoliu." },
    { q: "Cât durează perioada de probă?", a: "Orice agenție nouă primește 90 de zile de acces gratuit, fără card bancar." },
    { q: "Pot muta toată echipa?", a: "Da. Inviți agenții din aplicație și le stabilești rolurile. Numărul de agenți depinde de planul ales." },
  ] satisfies ComparisonFaq[],
};

export function comparisonLlmsMarkdown(): string {
  const faq = (items: readonly ComparisonFaq[]) => items.map((f) => `### ${f.q}\n\n${f.a}`).join("\n\n");
  const ex = compareCost(CALCULATOR_EXAMPLE.agents, CALCULATOR_EXAMPLE.pricePerAgent);
  return [
    `## ${COMPARISON_HUB.title}\n\nSource: https://www.habitoo.ro${COMPARISON_HUB.path}\n\n${COMPARISON_HUB.intro}\n\n${COMPARISON_HUB.checklist.map((c) => `**${c.title}**: ${c.text} În Habitoo: ${c.habitoo}`).join("\n\n")}\n\n${faq(COMPARISON_HUB.faq)}`,
    `## ${COST_CALCULATOR.title}\n\nSource: https://www.habitoo.ro${COST_CALCULATOR.path}\n\n${COST_CALCULATOR.intro}\n\n${COST_CALCULATOR.explanation.join("\n\n")}\n\n${exampleSentence(ex)}\n\n${faq(COST_CALCULATOR.faq)}`,
    `## ${ALTERNATIVE_PAGE.title}\n\nSource: https://www.habitoo.ro${ALTERNATIVE_PAGE.path}\n\n${ALTERNATIVE_PAGE.intro}\n\n${ALTERNATIVE_PAGE.steps.map((s) => `**${s.title}**\n\n${s.text}`).join("\n\n")}\n\n### Ce se păstrează\n\n${ALTERNATIVE_PAGE.kept.map((k) => `- ${k}`).join("\n")}\n\n### Ce trebuie verificat\n\n${ALTERNATIVE_PAGE.check.map((k) => `- ${k}`).join("\n")}\n\n${faq(ALTERNATIVE_PAGE.faq)}`,
  ].join("\n\n---\n\n");
}

export function formatEur(value: number): string {
  return `${new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 2 }).format(value)} €`;
}

export function exampleSentence(c: CostComparison): string {
  return `Exemplu: ${c.agents} agenți × ${formatEur(c.pricePerAgent)} pe agent pe lună = ${formatEur(c.currentMonthly)} pe lună, adică ${formatEur(c.currentAnnual)} pe an. Cu Habitoo ${c.planLabel}: ${formatEur(c.habitooMonthly)} pe lună la plata lunară sau ${formatEur(c.habitooAnnual)} pe an la plata anuală, cu 50% reducere.`;
}
