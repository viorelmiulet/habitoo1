import type { FaqItem } from "./FaqSection";

export const PUBLIC_COMMISSIONS_PATH = "/comisioane-agenti-imobiliari";
export const PUBLIC_COMMISSIONS_TITLE = "Evidența comisioanelor pentru agenții imobiliare | Habitoo CRM";
export const PUBLIC_COMMISSIONS_DESCRIPTION = "Ține evidența comisioanelor pe fiecare tranzacție: comisionul agenției și suma agentului, cine plătește, stare, rapoarte, curs BNR și export Excel, CSV sau PDF.";

export const commissionsSections = [
  {
    title: "Un comision pentru fiecare tranzacție",
    text: "Fiecare comision ține de o tranzacție: data, vânzare sau închiriere, tipul proprietății, locația și valoarea tranzacției. Poți lega comisionul de proprietatea și de clientul din CRM, ca să găsești ușor de unde a venit fiecare sumă. Poți adăuga și note.",
  },
  {
    title: "Comisionul agenției și suma agentului",
    text: "Pentru fiecare tranzacție scrii comisionul încasat de agenție și suma care revine agentului, în EUR sau RON. Sumele se introduc de mână; Habitoo nu calculează procente și nu împarte singur comisionul. Alegi și cine plătește: cumpărătorul, vânzătorul, proprietarul sau chiriașul.",
  },
  {
    title: "De încasat, încasat sau anulat",
    text: "Fiecare comision are o stare: De încasat, Încasat (cu data încasării) sau Anulat. Comisioanele anulate rămân în evidență, dar nu intră în totaluri, așa că vezi oricând cât ai de încasat și cât ai încasat deja.",
  },
  {
    title: "Precompletare din proprietate sau contract",
    text: "Când pornești de la o proprietate sau de la un contract din CRM, formularul se completează singur cu tipul tranzacției, tipul proprietății, clientul, prețul, moneda și comisionul trecut acolo, dacă este o sumă. Verifici și modifici înainte de salvare.",
  },
  {
    title: "Rapoarte pe perioade, agenți și tipuri de tranzacții",
    text: "Rapoartele arată totalurile pentru perioada aleasă, comparația cu o perioadă de referință, evoluția pe luni față de anul trecut și împărțirea comisionului agenției pe tip de tranzacție, tip de proprietate și agent. Poți vedea cifrele în EUR sau în RON.",
  },
  {
    title: "Curs BNR din ziua tranzacției",
    text: "Pentru conversia RON/EUR, la fiecare comision se păstrează cursul BNR din ziua tranzacției. Rapoartele și exporturile folosesc acest curs salvat, așa că cifrele unei tranzacții vechi nu se schimbă când se schimbă cursul de azi.",
  },
  {
    title: "Export Excel, CSV și PDF",
    text: "Exporți lista de comisioane în Excel, CSV sau PDF, exact cu filtrele aplicate și doar cu comisioanele pe care ai voie să le vezi, fără să se taie din rezultate.",
  },
  {
    title: "Cine vede ce",
    text: "Agentul își vede doar comisioanele lui. Administratorul agenției vede comisioanele tuturor agenților din agenție și poate aloca un comision unui agent; un comision alocat de administrator rămâne doar pentru citire pentru agent. Regula este aplicată în baza de date, nu doar în interfață.",
  },
] as const;

export const commissionsLimitations = [
  "Nu calculează comisionul din procente: sumele le scrii tu.",
  "Nu încasează bani și nu emite facturi sau chitanțe.",
  "Nu împarte automat comisionul între agenție și agent.",
  "Nu este un program de contabilitate și nu trimite date către contabilitate sau ANAF.",
  "Nu arată comisioanele unei agenții altor agenții.",
];

export const commissionsFaq: FaqItem[] = [
  {
    q: "Habitoo calculează singur comisionul?",
    a: "Nu. Scrii de mână comisionul agenției și suma agentului. Când pornești de la o proprietate sau un contract, Habitoo precompletează comisionul doar dacă acolo este trecută o sumă, nu un procent.",
  },
  {
    q: "Un agent poate vedea comisioanele colegilor?",
    a: "Nu. Agentul își vede doar comisioanele lui. Administratorul agenției le vede pe toate din agenție.",
  },
  {
    q: "Cum se face conversia între RON și EUR?",
    a: "La fiecare comision se păstrează cursul BNR din ziua tranzacției. Rapoartele și exporturile convertesc cu acest curs, nu cu cel de azi.",
  },
  {
    q: "Ce se întâmplă cu un comision anulat?",
    a: "Rămâne în listă cu starea Anulat, dar nu mai intră în totaluri și în rapoarte.",
  },
  {
    q: "În ce formate pot exporta comisioanele?",
    a: "Excel, CSV și PDF. Exportul conține exact comisioanele din filtrele aplicate, pe care ai dreptul să le vezi.",
  },
  {
    q: "Pot lega comisionul de proprietate și de client?",
    a: "Da. Alegi proprietatea și clientul din CRM, iar formularul poate fi precompletat din proprietate sau din contract.",
  },
];
