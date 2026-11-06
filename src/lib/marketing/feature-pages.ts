/**
 * Funcționalitățile Habitoo CRM: paginile dedicate /functionalitati/<slug> și cuprinsul de pe /functionalitati.
 * Textele sunt pentru agenți, fără termeni tehnici, prețuri sau nume de persoane.
 */
import { portalsLabel, publicPortalCount } from "@/lib/portals/integration-pages";

export const FEATURE_CATEGORIES = [
  "Portofoliu și publicare",
  "Clienți și vânzări",
  "Echipă și organizare",
  "Analize și documente",
] as const;
export type FeatureCategory = (typeof FEATURE_CATEGORIES)[number];

export type FeaturePage = {
  slug: string;
  name: string;
  /** ≤ 60 caractere */
  title: string;
  /** 140–160 caractere */
  description: string;
  h1: string;
  /** 2–3 paragrafe */
  intro: string[];
  /** 3–5 puncte */
  benefits: { title: string; text: string }[];
  /** „Cum funcționează”, 3–4 pași */
  steps: { title: string; text: string }[];
  /** 3–4 întrebări */
  faq: { q: string; a: string }[];
  /** Slug-uri de funcții (FEATURE_PAGES) și/sau de integrări (/integrari/<slug>). */
  related: string[];
  category: FeatureCategory;
};

/** Pagini dedicate. Conținutul se adaugă pe rând. */
export const FEATURE_PAGES: FeaturePage[] = [
  {
    slug: "proprietati",
    name: "Proprietăți",
    category: "Portofoliu și publicare",
    title: "Program gestiune proprietăți imobiliare | Habitoo CRM",
    description: "Program gestiune proprietăți imobiliare pentru agenția ta: fișe complete, fotografii ordonate, filtre salvate și publicare pe portaluri din același loc.",
    h1: "Gestiunea proprietăților agenției, într-o singură fișă",
    intro: [
      "Un program de gestiune a proprietăților imobiliare trebuie să-ți dea răspunsul în câteva secunde, nu după zece minute de căutat prin dosare și mesaje. În Habitoo, fiecare proprietate are o singură fișă. Acolo găsești datele ofertei, fotografiile, proprietarul și tot ce ai programat pentru ea.",
      "Completezi o dată tipul, tranzacția, prețul, suprafața, camerele, etajul, anul, zona, facilitățile și descrierea. Din aceeași fișă pregătești prezentarea pentru client și publici anunțul pe portaluri. Câștigi timp, iar portofoliul rămâne în ordine chiar și când lucrezi cu zeci de oferte în paralel.",
      "Pentru agenție, asta înseamnă un portofoliu comun, pe care fiecare agent îl găsește la fel de ușor. Pentru tine, înseamnă mai puțin timp pierdut cu căutări și mai mult timp pentru clienți. Când proprietarul sună să întrebe ce mai e nou, deschizi fișa și îi răspunzi pe loc: ce stare are oferta, ce vizionări au fost și pe ce portaluri apare anunțul."
    ],
    benefits: [
      { title: "Toate datele ofertei, la un click", text: "Caracteristicile, localizarea, facilitățile și descrierea stau împreună. Proprietarul este legat direct de ofertă. Înainte de un apel sau de o vizionare, ai totul în față." },
      { title: "Fotografii în ordinea aleasă de tine", text: "Încarci imaginile în galerie și le reordonezi cum vrei. Prima fotografie devine poza principală. Alegi tu imaginea care vinde oferta." },
      { title: "Starea reală a fiecărei proprietăți", text: "Folosești stările draft, activ, rezervat, în negociere, vândut, închiriat, expirat și arhivat. Dintr-o privire știi ce mai poți propune și ce este deja în discuție." },
      { title: "Găsești rapid oferta potrivită", text: "Cauți, filtrezi și sortezi lista. Salvezi vederile pe care le folosești des și marchezi favoritele. Revii la aceeași selecție fără să o refaci de fiecare dată." },
      { title: "Activități și publicare din aceeași fișă", text: `Programezi apeluri și vizionări direct din proprietate. Din fila Publicare alegi portalurile active ale agenției și urmărești rezultatul. Habitoo are integrări cu ${portalsLabel(publicPortalCount())} imobiliare.` }
    ],
    steps: [
      { title: "Completezi proprietatea", text: "Introduci datele ofertei și legi proprietarul. Descrierea și facilitățile stau lângă câmpurile principale, gata pentru prezentare." },
      { title: "Pregătești galeria", text: "Încarci fotografiile și le așezi în ordinea dorită. Pui pe primul loc imaginea care vrei să reprezinte oferta." },
      { title: "Organizezi lucrul cu oferta", text: "Alegi starea potrivită și programezi vizionările din fișă. Folosești filtrele, vederile salvate și favoritele ca să revii rapid la ea." },
      { title: "Alegi unde publici", text: "Deschizi fila Publicare și bifezi portalurile dorite. La vânzare, închiriere sau arhivare, anunțurile se retrag după regulile fiecărui portal, fără republicare automată." }
    ],
    faq: [
      { q: "Ce informații păstrez în fișa proprietății?", a: "Tipul, tranzacția, prețul, suprafața, camerele, etajul, anul, zona, facilitățile, descrierea și proprietarul. Lângă ele ai fotografiile și activitățile legate de ofertă. Totul într-un singur loc." },
      { q: "Cum aleg fotografia principală?", a: "Muți imaginea dorită pe prima poziție din galerie. Prima fotografie este cea principală. Verifici ordinea înainte de publicare și oferta pornește mereu cu cea mai bună imagine." },
      { q: "Pot reveni la filtrele pe care le folosesc des?", a: "Da. Salvezi vederi pentru lista de proprietăți și le deschizi oricând. Favoritele îți țin la îndemână ofertele cu care lucrezi acum. Căutarea și sortarea rămân mereu disponibile." },
      { q: "Unde văd ce permite fiecare portal?", a: "Pe pagina Integrări găsești lista portalurilor și detaliile fiecăruia. Acolo vezi cum se activează, cum se actualizează și cum se retrage un anunț. În proprietate alegi apoi dintre portalurile active ale agenției." }
    ],
    related: ["contacte", "cereri", "potriviri-automate", "integrari"]
  },
  {
    slug: "contacte",
    name: "Contacte",
    category: "Clienți și vânzări",
    title: "CRM clienți agenție imobiliară | Habitoo CRM",
    description: "CRM clienți agenție imobiliară: păstrezi contacte, surse, cereri, lead-uri, proprietăți, activități și note, cu legături directe în fișa fiecărui client.",
    h1: "Toți clienții agenției, cu istoricul complet",
    intro: [
      "Un CRM pentru clienții agenției imobiliare înseamnă mai mult decât o agendă de telefoane. În Habitoo, deschizi fișa unui client și vezi imediat ce caută, ce proprietăți deține, în ce discuții este implicat și ce ai vorbit ultima dată. Suni pregătit, nu din memorie.",
      "Lucrezi cu proprietari, cumpărători, chiriași, investitori și parteneri, toți în aceeași listă. Tipul și sursa te ajută să o organizezi. Când aceeași persoană vinde un apartament și caută altul, vezi ambele situații în fișa ei, fără confuzii.",
      "Câștigul se vede în fiecare zi. Nu mai cauți numărul unui proprietar prin mesaje vechi și nu mai uiți ce i-ai promis unui cumpărător. Iar când un coleg preia un client, găsește în fișă tot ce are nevoie ca să continue discuția fără să o ia de la zero. Clientul are parte de aceeași atenție, oricine îi răspunde."
    ],
    benefits: [
      { title: "Fiecare relație, cu tipul ei", text: "Alegi dacă persoana este proprietar, cumpărător, chiriaș, investitor sau partener. Filtrezi lista după tip și ajungi direct la oamenii de care ai nevoie acum." },
      { title: "Știi de unde a venit fiecare client", text: "Sursa contactului rămâne în fișă și poți filtra după ea. Deosebești imediat o recomandare de o cerere venită de pe un portal. Continui discuția știind cum a început." },
      { title: "Cereri și lead-uri, legate de client", text: "Din fișă ajungi direct la cererile și lead-urile persoanei. Cererea îți spune ce caută, lead-ul îți arată unde ai ajuns cu ea. Ai tabloul complet înainte de fiecare apel." },
      { title: "Proprietăți și activități în același loc", text: "Vezi proprietățile pe care le deține clientul și activitățile legate de el. De la un proprietar ajungi într-un click la oferta lui. Nicio vizionare programată nu se pierde." },
      { title: "Note pentru discuția următoare", text: "Notezi ce nu încape într-o cerere sau într-o fișă de proprietate. La următoarea discuție, notele te așteaptă lângă istoric. Clientul simte că îl cunoști." }
    ],
    steps: [
      { title: "Adaugi contactul", text: "Completezi datele clientului, alegi tipul și păstrezi sursa. În fișă notezi și acordul clientului, separat de restul informațiilor." },
      { title: "Legi cererile și proprietățile", text: "Asociezi cererea care descrie ce caută sau proprietatea pe care o deține. Criteriile din cerere sunt folosite apoi la potrivirile cu portofoliul." },
      { title: "Înregistrezi activitățile și notele", text: "Din fișa contactului creezi o activitate, o vizionare sau o cerere nouă. Tot ce adaugi rămâne legat de persoană." },
      { title: "Revii la client cu istoricul la îndemână", text: "Cauți contactul, deschizi fișa și vezi tot ce s-a întâmplat. Fiecare revenire continuă discuția de unde ai lăsat-o." }
    ],
    faq: [
      { q: "Pot păstra proprietari și cumpărători în aceeași listă?", a: "Da. Tipurile de contact deosebesc proprietarii, cumpărătorii, chiriașii, investitorii și partenerii. Filtrezi după tip când ai nevoie de o selecție anume. Fiecare contact are fișa lui." },
      { q: "Ce găsesc în istoricul clientului?", a: "Activitățile, vizionările și notele, alături de cereri, lead-uri și proprietățile deținute. Deschizi orice legătură pentru detalii. Ai toată relația cu agenția pe un singur ecran." },
      { q: "Care este diferența dintre contact și lead?", a: "Contactul este persoana. Lead-ul este o discuție comercială cu ea și etapa în care se află. Un client poate avea mai multe lead-uri, toate vizibile din fișa lui." },
      { q: "Unde păstrez ce caută clientul?", a: "Într-o cerere legată de contact, cu buget, zone și celelalte criterii. Așa Habitoo îți poate arăta proprietățile potrivite. Notele rămân pentru contextul discuției." }
    ],
    related: ["proprietati", "cereri", "lead-uri", "potriviri-automate"]
  },
  {
    slug: "cereri",
    name: "Cereri",
    category: "Clienți și vânzări",
    title: "Evidență cereri clienți imobiliare | Habitoo CRM",
    description: "Evidență cereri clienți imobiliare cu buget, zone, camere și suprafață: organizezi criteriile, verifici potrivirile și păstrezi legătura cu fiecare contact.",
    h1: "Cererile clienților, transformate în criterii clare",
    intro: [
      "Evidența cererilor clienților te ajută doar dacă poți lucra cu ea, nu doar s-o recitești. În Habitoo, ce îți spune clientul devine criterii clare: buget, zone, camere, suprafață și tip de proprietate. Pe baza lor vezi imediat ofertele potrivite din portofoliu.",
      "Înregistrezi cereri de cumpărare, închiriere și investiție. Fiecare cerere este legată de contact și de lead-urile lui. Așa ai mereu împreună persoana, ce caută și unde ați ajuns cu discuția. Nicio cerere nu se mai pierde într-un caiet.",
      "Diferența se simte când apare o ofertă nouă. În loc să-ți amintești cine căuta un apartament cu două camere în zona respectivă, deschizi potrivirile și vezi lista clienților. Suni primul, înaintea altor agenți. Iar când clientul te sună după două săptămâni, știi exact ce ți-a cerut, cât vrea să cheltuiască și ce i-ai propus deja."
    ],
    benefits: [
      { title: "Criterii clare în locul notițelor", text: "Bugetul, zonele, camerele, suprafața și tipul au fiecare câmpul lor. Nu mai interpretezi un text scris în grabă. Când clientul se răzgândește, schimbi doar criteriul respectiv." },
      { title: "Scopul căutării, de la început", text: "Alegi cumpărare, închiriere sau investiție. Două căutări cu bugete asemănătoare nu se mai amestecă. Știi exact ce fel de ofertă propui." },
      { title: "Proprietăți potrivite pentru fiecare cerere", text: "Deschizi potrivirile calculate pentru cerere. Fiecare ofertă are un scor și motive explicate. Alegi rapid ce merită propus clientului." },
      { title: "Legată de client și de discuție", text: "Din cerere ajungi la contact și la lead-urile lui. Vezi ce caută persoana și cât de avansată este negocierea. Totul fără să rescrii nimic." },
      { title: "O listă pe care o restrângi ușor", text: "Filtrezi cererile după tip, stare, prioritate, agent sau oraș. Ajungi direct la clienții cu care lucrezi azi. Nu mai deschizi fișă după fișă." }
    ],
    steps: [
      { title: "Pornești de la discuția cu clientul", text: "Stabilești dacă e cumpărare, închiriere sau investiție și legi cererea de contact. Din acest moment, nevoia clientului are un loc al ei." },
      { title: "Completezi criteriile", text: "Introduci bugetul, zonele, camerele, suprafața și tipul proprietății. Contextul discuției îl lași în notele contactului." },
      { title: "Verifici proprietățile potrivite", text: "Deschizi potrivirile și citești motivele fiecărui scor. Alegi ofertele pe care le propui și programezi vizionările." },
      { title: "Actualizezi când se schimbă ceva", text: "Clientul schimbă bugetul sau zona? Modifici cererea, iar potrivirile se recalculează. Urmărești apoi discuția în lead." }
    ],
    faq: [
      { q: "Ce tipuri de cereri pot înregistra?", a: "Cumpărare, închiriere și investiție. Pentru fiecare completezi criteriile proprietății: buget, zone, camere, suprafață și tip. Ai astfel scopul căutării și detaliile ei la un loc." },
      { q: "De ce să nu păstrez criteriile doar în note?", a: "Pentru că doar criteriile din câmpurile cererii sunt comparate cu proprietățile. O notă nu poate aduce oferte potrivite. Cu criterii clare, vezi imediat ce trebuie actualizat după un apel." },
      { q: "Pot vedea de ce o proprietate se potrivește?", a: "Da. Fiecare rezultat are un scor și motive: ce criterii sunt îndeplinite și unde apar diferențe. Ai argumente concrete pentru discuția cu clientul." },
      { q: "Cererea rămâne legată de client?", a: "Da. Cererea este legată de contact și de lead-urile lui. Ajungi într-un click la istoricul persoanei sau la evoluția discuției. Dacă același client are mai multe căutări, de exemplu o închiriere acum și o cumpărare mai târziu, le ții ca cereri separate, fiecare cu criteriile ei." }
    ],
    related: ["contacte", "proprietati", "lead-uri", "potriviri-automate"]
  },
  {
    slug: "lead-uri",
    name: "Lead-uri",
    category: "Clienți și vânzări",
    title: "Pipeline vânzări imobiliare | Habitoo CRM",
    description: "Pipeline vânzări imobiliare cu nouă etape, coloane și listă: urmărești lead-urile, istoricul și agentul responsabil, inclusiv cererile venite de pe portaluri.",
    h1: "Pipeline-ul de vânzări al agenției, de la primul contact la tranzacție",
    intro: [
      "Un pipeline de vânzări imobiliare îți arată unde ești cu fiecare client, nu doar câți clienți ai. În Habitoo, urmărești fiecare lead de la primul mesaj până la tranzacție. Știi mereu cine așteaptă un telefon, cine a văzut proprietatea și cine e aproape de semnare.",
      "Ai nouă etape: Nou, Contactat, Calificat, Vizionare, Ofertă, Negociere, Tranzacție, Câștigat și Pierdut. Lucrezi pe coloane sau în listă, cu filtre. Iar cererile primite de pe portalurile conectate intră singure ca lead-uri, așa că niciun client nu rămâne fără răspuns.",
      "Pentru tine, pipeline-ul înseamnă o zi organizată: vezi dintr-o privire ce discuții stau pe loc și ce clienți sunt aproape de decizie. Pentru agenție, înseamnă o imagine clară a vânzărilor din echipă. Știi câte discuții sunt la vizionare, câte la ofertă și câte se apropie de tranzacție. Iar istoricul păstrat la fiecare lead face ca preluarea unui client de către un coleg să fie simplă."
    ],
    benefits: [
      { title: "Etape pentru tot drumul vânzării", text: "Muți lead-ul din etapă în etapă, pe măsură ce discuția avansează. La final alegi Câștigat sau Pierdut. Fiecare schimbare rămâne în istoric." },
      { title: "Coloane sau listă, cum lucrezi tu", text: "Pe calculator tragi cardul în coloana potrivită. În listă filtrezi după etapă, agent, sursă sau căutare. Pe telefon schimbi etapa dintr-o selecție." },
      { title: "Istoric complet și agent responsabil", text: "Vezi toate schimbările, notele și activitățile lead-ului. Știi cine se ocupă de el. Preiei o discuție fără să întrebi pe nimeni ce s-a întâmplat." },
      { title: "Legat de client, cerere și proprietate", text: "Din lead ajungi direct la contact, la cererea lui și la proprietatea discutată. Pregătești o ofertă sau o vizionare fără să rescrii informațiile." },
      { title: "Cererile de pe portaluri intră singure", text: "Cererile primite pe Storia/OLX, Housera, VDI și Properstar devin automat lead-uri, pentru agențiile conectate. Le lucrezi în același loc cu restul clienților. Nicio cerere pierdută." }
    ],
    steps: [
      { title: "Deschizi lead-ul", text: "Vezi sursa, agentul responsabil și legăturile cu clientul, cererea și proprietatea. Pentru lead-urile de pe portaluri, citești mesajul primit înainte să suni." },
      { title: "Muți lead-ul în etapa potrivită", text: "Tragi cardul sau alegi etapa care descrie situația reală. Notezi ce ai aflat și programezi următoarea activitate." },
      { title: "Duci discuția până la capăt", text: "Filtrezi lead-urile care cer atenție și le actualizezi pe măsură ce avansează. La final alegi Câștigat sau Pierdut, iar parcursul rămâne în istoric." }
    ],
    faq: [
      { q: "Care sunt etapele disponibile?", a: "Nou, Contactat, Calificat, Vizionare, Ofertă, Negociere, Tranzacție, Câștigat și Pierdut. Istoricul păstrează fiecare schimbare, așa că vezi oricând drumul complet al unui lead." },
      { q: "Pot lucra fără să trag cardurile?", a: "Da. Ai și vederea de listă, cu filtre, iar etapa se poate alege dintr-o selecție. Pe telefon așa schimbi etapa. Coloanele și lista arată aceleași lead-uri." },
      { q: "De pe ce portaluri intră lead-uri?", a: "De pe Storia/OLX, Housera, VDI și Properstar, dacă agenția are conexiunea activă și drepturile necesare pe portal. Detaliile fiecăruia sunt pe pagina Integrări." },
      { q: "Ce verific înainte să continui un lead?", a: "Etapa, agentul responsabil, istoricul și legăturile cu clientul, cererea și proprietatea. Citești notele și ultimele activități. Apoi suni știind exact de unde continui. Dacă lead-ul a venit de pe un portal, vezi și mesajul trimis de client acolo, ca să răspunzi exact la ce a întrebat." }
    ],
    related: ["contacte", "cereri", "potriviri-automate", "integrari"]
  },
  {
    slug: "potriviri-automate",
    name: "Potriviri automate",
    category: "Clienți și vânzări",
    title: "Matching proprietăți clienți | Habitoo CRM",
    description: "Matching proprietăți clienți în ambele sensuri: compari cereri și oferte după criterii, cu scor și motive explicate, recalculate din informațiile actualizate.",
    h1: "Potriviri automate între cereri și proprietăți",
    intro: [
      "Potrivirea proprietăților cu clienții îți ia ore când o faci de mână. În Habitoo, o vezi imediat: pentru o cerere, proprietățile potrivite; pentru o proprietate, clienții care caută ceva asemănător. Totul pornind de la datele pe care le ai deja în aplicație.",
      "Fiecare potrivire are un scor și motive explicate. Se compară tranzacția, bugetul, orașul și zona, camerele, suprafața, tipul și facilitățile cerute. Când schimbi o cerere sau o ofertă, rezultatele se recalculează singure.",
      "Câștigul este dublu. Clientul primește mai repede propuneri care chiar se potrivesc cu ce a cerut. Tu nu mai pierzi timp cu oferte nepotrivite și nu mai uiți de cumpărătorul care căuta exact proprietatea abia intrată în portofoliu. Când preiei o exclusivitate nouă, știi din primele minute câți clienți din baza agenției ar putea fi interesați și pe cine să suni primul. Iar motivele afișate lângă fiecare scor îți dau argumente concrete pentru apel."
    ],
    benefits: [
      { title: "De la o cerere la proprietăți", text: "Deschizi cererea și vezi ofertele potrivite din portofoliu. Le parcurgi în ordinea scorului. În câteva minute ai selecția pentru client." },
      { title: "De la o proprietate la clienți", text: "Ai o ofertă nouă? Vezi imediat clienții ale căror cereri se potrivesc. Știi pe cine să suni primul, fără să recitești fiecare cerere." },
      { title: "Criterii care contează în imobiliare", text: "Tranzacția, bugetul, orașul și zona, camerele, suprafața și tipul sunt comparate automat. Facilitățile intră în calcul când clientul le cere. Cu cât datele sunt mai complete, cu atât rezultatele sunt mai bune." },
      { title: "Scor cu motive explicate", text: "Nu vezi doar un procent. Vezi ce criterii sunt îndeplinite și unde apar diferențe. Ai argumente clare când propui oferta." },
      { title: "Mereu la zi", text: "Clientul schimbă bugetul sau zona? Potrivirile se recalculează imediat. Lucrezi mereu cu selecția corectă." }
    ],
    steps: [
      { title: "Completezi cererile și proprietățile", text: "Bugetul, localizarea, camerele, suprafața și facilitățile stau în câmpurile lor. Din ele se calculează potrivirile." },
      { title: "Alegi de unde pornești", text: "Pornești de la cerere când cauți oferte pentru un client. Pornești de la proprietate când cauți clienți pentru o ofertă." },
      { title: "Citești scorul și motivele", text: "Compari rezultatele, clarifici diferențele cu clientul și propui vizionările. Când criteriile se schimbă, revii la potrivirile recalculate." }
    ],
    faq: [
      { q: "Pot căuta atât proprietăți, cât și clienți?", a: "Da. Ai ambele sensuri: Cerere → Proprietăți și Proprietate → Clienți. Alegi punctul de pornire după ce lucrezi în acel moment." },
      { q: "Ce criterii intră în potrivire?", a: "Tranzacția, bugetul, orașul și zona, camerele, suprafața, tipul proprietății și facilitățile cerute. Rezultatele folosesc datele completate în aplicație, așa că merită să le ții la zi." },
      { q: "Scorul înseamnă că un client va cumpăra?", a: "Nu. Scorul arată cât de bine se potrivesc criteriile cu oferta. Interesul real îl afli din discuția cu clientul. Motivele te ajută să pregătești acea discuție." },
      { q: "Ce se întâmplă după modificarea cererii?", a: "Potrivirile se recalculează din noile criterii. Deschizi rezultatele și vezi imediat selecția actualizată, fără să refaci căutarea. La fel se întâmplă când actualizezi prețul sau caracteristicile unei proprietăți: lista clienților potriviți se schimbă odată cu ea." }
    ],
    related: ["cereri", "proprietati", "contacte", "lead-uri"]
  }
  ,{
    slug: "activitati",
    name: "Activități",
    category: "Echipă și organizare",
    title: "Program activități agent imobiliar | Habitoo CRM",
    description: "Program activități agent imobiliar: apeluri, întâlniri, vizionări și sarcini legate de client și proprietate, cu termen, responsabil și stare clară.",
    h1: "Tot ce ai de făcut, legat de client și de proprietate",
    intro: [
      "Ziua unui agent imobiliar înseamnă apeluri, vizionări, întâlniri cu proprietari, emailuri și revenirile promise clienților. Când le ții în carnete, în telefon sau în memorie, una dintre ele se pierde exact când contează. În Habitoo, fiecare lucru de făcut devine o activitate cu termen, responsabil și stare, legată de clientul, proprietatea sau lead-ul la care se referă.",
      "Poți înregistra apeluri, întâlniri, vizionări, sarcini, emailuri, reveniri și note. Le creezi direct din fișa proprietății, a contactului sau a lead-ului, astfel încât legătura se face de la început. Când termini, marchezi activitatea ca finalizată, iar ea rămâne în istoric, unde o regăsești oricând deschizi din nou fișa."
    ],
    benefits: [
      { title: "Fiecare activitate are context", text: "O vizionare este legată de proprietate și de client, iar un apel este legat de lead-ul pe care îl urmărești. Când deschizi fișa, vezi ce s-a întâmplat înainte și ce urmează, fără să cauți prin mesaje sau notițe separate." },
      { title: "Termen, responsabil și stare", text: "Stabilești când trebuie făcută activitatea și cine se ocupă de ea. Starea îți arată ce este deschis și ce este finalizat, așa că știi în fiecare moment ce ai de făcut azi și ce ai rămas dator să închizi." },
      { title: "Un centru pentru toate activitățile", text: "Toate activitățile tale apar într-un singur loc, unde le filtrezi după tip și stare. Vezi doar vizionările, doar apelurile sau doar sarcinile restante, fără să deschizi pe rând fiecare client sau fiecare proprietate." },
      { title: "Istoric care rămâne", text: "Activitățile finalizate nu dispar. Rămân în istoricul clientului, al proprietății și al lead-ului, astfel încât tu sau un coleg puteți vedea ce discuții, vizite și reveniri au existat înainte de următorul pas." }
    ],
    steps: [
      { title: "Creezi activitatea din fișă", text: "Din proprietate, contact sau lead, adaugi rapid o activitate. Alegi tipul, de exemplu apel, vizionare sau întâlnire, iar legătura cu fișa din care pornești se face automat." },
      { title: "Stabilești termenul și responsabilul", text: "Completezi data, agentul care se ocupă și, dacă e nevoie, o descriere scurtă. Activitățile programate apar și în calendar, alături de celelalte întâlniri ale tale." },
      { title: "Urmărești ce ai de făcut", text: "În centrul de activități filtrezi după tip și stare. Vezi ce ai deschis, ce urmează și ce ai amânat, ca să-ți organizezi ziua pornind de la o listă clară." },
      { title: "Marchezi ca finalizat", text: "După apel sau vizionare, marchezi activitatea ca finalizată. Ea rămâne în istoric, iar tu poți adăuga imediat următoarea activitate pentru același client." }
    ],
    faq: [
      { q: "Ce tipuri de activități pot adăuga?", a: "Poți adăuga apeluri, întâlniri, vizionări, sarcini, emailuri, reveniri și note. Fiecare are termen, responsabil și stare, iar tipul te ajută să filtrezi lista atunci când vrei să vezi doar un anumit fel de activitate." },
      { q: "Unde văd activitățile unui client?", a: "Le vezi în fișa contactului, alături de cererile, lead-urile și proprietățile lui. Aceleași activități apar și în fișa proprietății sau a lead-ului la care sunt legate, așa că istoricul este disponibil din oricare dintre ele." },
      { q: "Ce se întâmplă cu activitățile finalizate?", a: "Rămân în istoric. Nu le ștergi ca să faci ordine, ci le marchezi ca finalizate. Așa păstrezi evidența discuțiilor și a vizitelor, iar lista activităților deschise rămâne scurtă și ușor de urmărit." }
    ],
    related: ["calendar", "contacte", "lead-uri", "proprietati", "obiective"]
  },
  {
    slug: "calendar",
    name: "Calendar",
    category: "Echipă și organizare",
    title: "Calendar agenție imobiliară pentru vizionări | Habitoo CRM",
    description: "Calendar agenție imobiliară cu vizionările și întâlnirile echipei într-o singură agendă, pe zile și săptămâni, pentru fiecare agent sau toată agenția.",
    h1: "Vizionările și întâlnirile echipei, într-o singură agendă",
    intro: [
      "Într-o agenție imobiliară, programul se schimbă des: un client mută vizionarea, un proprietar cere o întâlnire, un coleg are nevoie de cheie. Când fiecare agent își ține agenda separat, suprapunerile și uitările apar ușor. În Habitoo, calendarul arată activitățile programate pe zile și săptămâni, pentru un agent sau pentru toată agenția.",
      "Calendarul nu este o listă separată pe care o completezi a doua oară. Vizionările programate din proprietate sau din lead și celelalte activități cu termen apar automat în el. Iar agenda zilei curente o vezi direct pe ecranul de start, imediat după ce intri în aplicație.",
      "Pentru administrator, calendarul agenției devine locul în care vede cum sunt împărțite vizionările și întâlnirile între agenți. Pentru agent, este locul în care își planifică săptămâna și verifică, înainte de a confirma o vizionare nouă, dacă ziua respectivă mai are timp liber."
    ],
    benefits: [
      { title: "O singură agendă pentru tot ce ai programat", text: "Vizionările, întâlnirile, apelurile și sarcinile cu termen apar în același calendar. Nu mai compari mai multe liste ca să afli ce ai de făcut mâine sau dacă mai ai loc pentru o vizionare nouă." },
      { title: "Vedere pe zi și pe săptămână", text: "Alegi vederea zilnică atunci când vrei detaliile unei zile aglomerate și vederea săptămânală când îți planifici întâlnirile. Treci ușor de la una la alta, în funcție de ce trebuie să organizezi." },
      { title: "Agenda ta sau a întregii agenții", text: "Vezi doar activitățile tale sau pe cele ale echipei. Așa afli cine este disponibil, cine are deja vizionări în aceeași zi și cum este împărțită munca, fără să suni pe fiecare coleg." },
      { title: "Legat de proprietate și de client", text: "O vizionare din calendar duce la proprietatea și la clientul pentru care a fost programată. Înainte de întâlnire deschizi fișa și verifici detaliile, istoricul și ce ai discutat ultima dată." }
    ],
    steps: [
      { title: "Programezi din fișă", text: "Din proprietate sau din lead programezi o vizionare ori o întâlnire, cu dată, oră și agent responsabil. Activitatea apare imediat în calendar, fără să o introduci a doua oară." },
      { title: "Alegi vederea", text: "Deschizi calendarul pe zi sau pe săptămână și alegi dacă vezi doar programul tău sau pe al întregii agenții. Fiecare activitate are tipul ei, ca să o recunoști ușor." },
      { title: "Pornești ziua de pe ecranul de start", text: "Când intri în aplicație, agenda de azi apare pe ecranul de start. Vezi pe loc ce vizionări și întâlniri urmează, fără să deschizi calendarul complet." },
      { title: "Închizi activitatea după întâlnire", text: "După vizionare, marchezi activitatea ca finalizată. Ea rămâne în istoricul proprietății și al clientului, iar tu poți programa următorul pas din aceeași fișă." }
    ],
    faq: [
      { q: "Ce apare în calendar?", a: "Apar activitățile programate cu termen: vizionări, întâlniri, apeluri, sarcini și reveniri. Le creezi din fișa proprietății, a contactului sau a lead-ului ori din centrul de activități, iar calendarul le afișează automat pe zilele lor." },
      { q: "Pot vedea programul colegilor?", a: "Da, calendarul poate afișa activitățile întregii agenții, nu doar pe ale tale. Astfel vezi cine are vizionări într-o anumită zi și poți organiza mai ușor întâlnirile echipei, fără suprapuneri inutile." },
      { q: "Trebuie să deschid calendarul în fiecare dimineață?", a: "Nu neapărat. Agenda zilei curente apare pe ecranul de start, imediat după autentificare. Deschizi calendarul complet doar când vrei să vezi alte zile sau întreaga săptămână." },
      { q: "Ce fac dacă o vizionare se mută?", a: "Deschizi activitatea și schimbi data sau ora. Calendarul afișează noua programare, iar activitatea rămâne legată de aceeași proprietate și de același client, astfel încât istoricul nu se pierde și colegii văd programul actualizat." }
    ],
    related: ["activitati", "proprietati", "lead-uri", "ecran-de-start"]
  },
  {
    slug: "obiective",
    name: "Obiective",
    category: "Echipă și organizare",
    title: "Obiective agenți imobiliari, cu progres real | Habitoo CRM",
    description: "Obiective agenți imobiliari stabilite lunar pentru lead-uri, vizionări, proprietăți noi, tranzacții sau comision, cu progres calculat din activitatea reală.",
    h1: "Ținte clare pentru fiecare agent, cu progres vizibil",
    intro: [
      "O țintă lunară funcționează doar dacă știi, pe parcursul lunii, cât de aproape ești de ea. Când progresul se calculează la final, în tabele completate de mână, e deja prea târziu să schimbi ceva. În Habitoo, stabilești obiective lunare pentru lead-uri, vizionări, proprietăți noi, tranzacții sau comision, iar progresul se vede pe tot parcursul lunii.",
      "Obiectivele pot fi stabilite pe agent și pe agenție. Progresul nu se introduce manual: se calculează din activitatea reală înregistrată în aplicație, adică din lead-urile, vizionările, proprietățile și tranzacțiile pe care le lucrezi zilnic. Obiectivele apar pe ecranul de start și în rapoarte.",
      "Astfel, discuția despre rezultate se mută de la impresii la cifre pe care toată echipa le vede la fel. Agentul știe ce mai are de făcut până la sfârșitul lunii, iar administratorul observă din timp unde e nevoie de sprijin, nu abia când luna s-a încheiat."
    ],
    benefits: [
      { title: "Ținte pe care le înțelege toată lumea", text: "Fiecare obiectiv are un tip, o valoare și o lună. Agentul știe exact ce urmărește, de exemplu un anumit număr de vizionări sau de proprietăți noi, iar agenția vede aceleași cifre, fără interpretări diferite." },
      { title: "Progres din munca reală", text: "Progresul se calculează din ce ai înregistrat în aplicație. Nu mai completezi separat un tabel cu rezultatele lunii, iar cifra afișată corespunde lead-urilor, vizionărilor și tranzacțiilor pe care le-ai lucrat efectiv." },
      { title: "Vizibil în fiecare zi", text: "Obiectivele apar pe ecranul de start, lângă agenda și lead-urile tale. Vezi cât mai ai până la țintă de fiecare dată când intri în aplicație, nu doar la ședința de la sfârșitul lunii." },
      { title: "Pe agent și pe agenție", text: "Poți urmări atât ținta fiecărui agent, cât și pe cea a întregii agenții. În rapoarte vezi activitatea și obiectivele agenților împreună, ca să înțelegi unde merge bine și unde e nevoie de sprijin." }
    ],
    steps: [
      { title: "Stabilești obiectivul lunar", text: "Alegi tipul obiectivului, de exemplu lead-uri, vizionări, proprietăți noi, tranzacții sau comision, și valoarea pe care vrei să o atingi în luna respectivă, pentru un agent sau pentru agenție." },
      { title: "Lucrezi ca de obicei", text: "Adaugi proprietăți, programezi vizionări și muți lead-urile pe etape. Nu ai nimic în plus de completat pentru obiective, pentru că progresul se calculează din aceste date." },
      { title: "Urmărești progresul", text: "Pe ecranul de start vezi cât ai realizat din fiecare obiectiv. Dacă rămâi în urmă la jumătatea lunii, afli la timp și îți poți reorganiza agenda." },
      { title: "Analizezi în rapoarte", text: "În rapoarte compari obiectivele cu activitatea agenților. Folosești aceste cifre la discuțiile cu echipa și la stabilirea țintelor pentru luna următoare." }
    ],
    faq: [
      { q: "Pentru ce pot stabili obiective?", a: "Poți stabili obiective lunare pentru lead-uri, vizionări, proprietăți noi, tranzacții sau comision. Fiecare obiectiv are o valoare țintă, iar progresul se raportează la aceasta pe parcursul lunii." },
      { q: "Trebuie să introduc progresul de mână?", a: "Nu. Progresul se calculează din activitatea reală din aplicație. Când adaugi o proprietate, finalizezi o vizionare sau închizi o tranzacție, cifra obiectivului ține cont de aceste date." },
      { q: "Unde văd obiectivele?", a: "Le vezi pe ecranul de start, alături de agenda și lead-urile tale, și în rapoarte, unde apar împreună cu activitatea agenților. Așa le urmărești zilnic și le analizezi la sfârșitul lunii." },
      { q: "Obiectivele înlocuiesc evidența comisioanelor?", a: "Nu. Un obiectiv de comision îți arată progresul față de ținta lunii, dar sumele, împărțirea pe agenți și exporturile se țin în secțiunea dedicată comisioanelor. Cele două se completează: unul urmărește ținta, celălalt evidența." }
    ],
    related: ["rapoarte", "ecran-de-start", "activitati", "comisioane-agenti-imobiliari"]
  },
  {
    slug: "ecran-de-start",
    name: "Ecran de start",
    category: "Analize și documente",
    title: "Dashboard CRM imobiliar pentru fiecare rol | Habitoo CRM",
    description: "Dashboard CRM imobiliar diferit pentru agent și administrator: agenda de azi, lead-uri, obiective și indicatorii agenției, din primul ecran al aplicației.",
    h1: "Un ecran de start diferit pentru fiecare rol",
    intro: [
      "Primul ecran pe care îl vezi dimineața ar trebui să-ți spună ce ai de făcut, nu să te trimită prin cinci meniuri. În Habitoo, ecranul de start se adaptează rolului tău. Agentul își vede agenda, lead-urile și obiectivele, iar administratorul vede întreaga agenție și activitatea echipei.",
      "Pe același ecran găsești indicatorii principali: proprietăți active, lead-uri noi, cereri și vizionări. Vezi agenda de azi și pipeline-ul pe scurt, iar de oriunde din aplicație poți adăuga rapid o înregistrare nouă sau poți căuta un client, o proprietate ori un lead.",
      "Ideea este simplă: deschizi aplicația și știi imediat ce urmează. Nu cauți vizionările de azi prin calendar, lead-urile noi prin listă și obiectivele prin rapoarte, ci le vezi împreună, pe primul ecran, și pornești de acolo spre fișa de care ai nevoie."
    ],
    benefits: [
      { title: "Ce contează pentru rolul tău", text: "Agentul nu este încărcat cu cifrele întregii agenții, iar administratorul nu trebuie să deschidă pe rând contul fiecărui agent. Fiecare vede de la început informațiile cu care lucrează în mod obișnuit." },
      { title: "Indicatori dintr-o privire", text: "Proprietățile active, lead-urile noi, cererile și vizionările apar ca cifre pe ecranul de start. Înțelegi rapid cum arată portofoliul și volumul de lucru, fără să construiești singur un raport." },
      { title: "Agenda și pipeline-ul pe scurt", text: "Vezi activitățile programate pentru azi și un rezumat al lead-urilor pe etape. Știi ce întâlniri urmează și ce clienți așteaptă un pas următor, înainte de primul apel al zilei." },
      { title: "Adăugare rapidă și căutare globală", text: "Din orice ecran poți adăuga o proprietate, un contact sau o activitate și poți căuta în toată aplicația. Nu pierzi timp navigând înapoi doar ca să notezi un client nou." }
    ],
    steps: [
      { title: "Intri în aplicație", text: "După autentificare ajungi direct pe ecranul de start potrivit rolului tău. Nu trebuie să alegi nimic sau să configurezi singur ce informații apar." },
      { title: "Verifici agenda și indicatorii", text: "Citești agenda de azi, cifrele principale și pipeline-ul pe scurt. Agentul își vede și obiectivele, iar administratorul vede activitatea echipei." },
      { title: "Treci la lucru din același loc", text: "Deschizi direct activitatea, lead-ul sau proprietatea care te interesează. Folosești adăugarea rapidă și căutarea globală pentru tot ce apare pe parcursul zilei." },
      { title: "Revii oricând pe parcursul zilei", text: "Între două întâlniri te întorci pe ecranul de start ca să vezi ce a rămas din agenda zilei și dacă au apărut lead-uri noi. Cifrele și lista se bazează pe datele actuale din aplicație." }
    ],
    faq: [
      { q: "De ce văd altceva decât colegul meu?", a: "Ecranul de start depinde de rol. Agentul își vede agenda, lead-urile și obiectivele, iar administratorul vede întreaga agenție și activitatea echipei. Fiecare primește informațiile cu care lucrează zilnic." },
      { q: "Ce indicatori apar?", a: "Apar proprietățile active, lead-urile noi, cererile și vizionările, alături de agenda de azi și de pipeline-ul pe scurt. Pentru analize mai detaliate, cum ar fi sursele lead-urilor, folosești rapoartele." },
      { q: "Pot căuta un client fără să părăsesc ecranul?", a: "Da. Căutarea globală este disponibilă din orice ecran, la fel ca adăugarea rapidă. Găsești un client, o proprietate sau un lead și îl deschizi direct, fără să treci prin meniuri." },
      { q: "Ce vede administratorul agenției?", a: "Administratorul vede situația întregii agenții și activitatea echipei, nu doar propriile activități. Astfel urmărește volumul de lucru, lead-urile noi și vizionările programate, iar pentru detalii pe fiecare agent deschide rapoartele." }
    ],
    related: ["calendar", "obiective", "rapoarte", "lead-uri"]
  },
  {
    slug: "rapoarte",
    name: "Rapoarte",
    category: "Analize și documente",
    title: "Rapoarte agenție imobiliară, fără calcule | Habitoo CRM",
    description: "Rapoarte agenție imobiliară despre portofoliu, surse de lead-uri, etapele vânzării și activitatea agenților, calculate din datele pe care le lucrezi zilnic.",
    h1: "Cifrele agenției, fără export manual",
    intro: [
      "Ca să iei decizii bune, ai nevoie de cifre corecte despre portofoliu, clienți și echipă. Când le aduni din tabele separate, la sfârșitul lunii, pierzi timp și riști greșeli. În Habitoo, rapoartele se calculează din datele pe care tu și colegii voștri le lucrați zilnic în aplicație.",
      "Vezi proprietățile pe status și pe tip, sursele lead-urilor și numărul lor pe fiecare etapă a vânzării, precum și activitatea și obiectivele agenților. Nu exporți date ca să le prelucrezi în altă parte: deschizi rapoartele și citești situația agenției așa cum este în acel moment.",
      "Rapoartele sunt utile atât administratorului, care urmărește agenția în ansamblu, cât și agentului, care vrea să înțeleagă de unde vin clienții lui și unde rămân aceștia pe drum. Toți pornesc de la aceleași date, introduse o singură dată, în locul în care lucrează zilnic."
    ],
    benefits: [
      { title: "Portofoliul, pe status și pe tip", text: "Vezi câte proprietăți sunt active, rezervate, în negociere, vândute sau închiriate și cum se împart pe tipuri. Înțelegi ce ai de oferit clienților și unde ai nevoie de proprietăți noi." },
      { title: "De unde vin clienții", text: "Raportul surselor îți arată de unde au venit lead-urile. Vezi ce canale aduc cei mai mulți clienți potențiali și unde merită să îți concentrezi efortul în lunile următoare." },
      { title: "Unde se opresc vânzările", text: "Numărul de lead-uri pe fiecare etapă, de la primul contact la tranzacție, arată unde rămân clienții. Dacă multe lead-uri se opresc după vizionare, știi ce parte a procesului trebuie îmbunătățită." },
      { title: "Activitatea și obiectivele echipei", text: "Vezi activitatea fiecărui agent alături de obiectivele lui. Discuțiile cu echipa pornesc de la aceleași cifre, calculate din munca reală, nu din estimări sau din tabele completate de mână." }
    ],
    steps: [
      { title: "Lucrezi în aplicație", text: "Adaugi proprietăți, înregistrezi lead-urile cu sursa lor, le muți pe etape și finalizezi activități. Aceste date sunt baza rapoartelor, fără să completezi altceva." },
      { title: "Deschizi rapoartele", text: "Alegi raportul care te interesează: portofoliu, surse de lead-uri, etapele vânzării sau activitatea agenților. Cifrele sunt calculate din datele existente în acel moment." },
      { title: "Iei decizii", text: "Folosești rapoartele pentru a stabili unde cauți proprietăți noi, ce surse de clienți păstrezi și cum ajuți agenții care au nevoie de sprijin." },
      { title: "Revii lunar", text: "La sfârșitul fiecărei luni compari cifrele cu cele din luna anterioară și cu obiectivele stabilite. Așa vezi dacă schimbările făcute în modul de lucru au avut efect." }
    ],
    faq: [
      { q: "Ce rapoarte am la dispoziție?", a: "Ai rapoarte despre proprietăți pe status și pe tip, despre sursele lead-urilor și numărul lor pe etape, precum și despre activitatea și obiectivele agenților. Pentru comisioane există o secțiune separată, cu rapoarte și exporturi proprii." },
      { q: "Trebuie să pregătesc datele înainte?", a: "Nu. Rapoartele folosesc datele pe care le introduci oricum în aplicație. Cu cât completezi mai atent sursa lead-urilor, stările proprietăților și activitățile, cu atât cifrele sunt mai utile." },
      { q: "Cifrele sunt actuale?", a: "Rapoartele se calculează din informațiile existente în aplicație atunci când le deschizi. Dacă un coleg schimbă starea unei proprietăți sau mută un lead pe altă etapă, modificarea se reflectă în cifre." },
      { q: "Pot vedea activitatea fiecărui agent?", a: "Da. Rapoartele arată activitatea agenților împreună cu obiectivele lor. Administratorul înțelege astfel cum este împărțită munca în echipă și poate discuta cu fiecare agent pornind de la cifre concrete, nu de la impresii." }
    ],
    related: ["ecran-de-start", "obiective", "lead-uri", "comisioane-agenti-imobiliari"]
  }

];

export const FEATURES_LASTMOD = "2026-11-06";

/** O intrare din cuprins: pagină dedicată, pagină existentă sau secțiune de pe /functionalitati. */
export type FeatureEntry = {
  key: string;
  name: string;
  summary: string;
  category: FeatureCategory;
  /** Adresa linkului „Află mai multe”. */
  to: string;
  hash?: string;
  kind: "page" | "external" | "section";
};

/** Funcții cu pagină proprie deja publicată; rămân la adresa lor. */
const EXTERNAL: FeatureEntry[] = [
  { key: "integrari", name: "Publicare pe portaluri", summary: `Publici proprietățile pe ${portalsLabel(publicPortalCount())} imobiliare direct din Habitoo, cu actualizare și retragere automată.`, category: "Portofoliu și publicare", to: "/integrari", kind: "external" },
  { key: "import-proprietati", name: "Import proprietăți", summary: "Muți portofoliul din alt CRM în Habitoo, cu poze și date păstrate, fără să introduci totul de la zero.", category: "Portofoliu și publicare", to: "/import-proprietati", kind: "external" },
  { key: "anunturi-proprietari", name: "Anunțuri de la proprietari", summary: "Vezi anunțurile noi ale proprietarilor, le filtrezi și le aduci în portofoliu cu acordul lor.", category: "Portofoliu și publicare", to: "/anunturi-proprietari", kind: "external" },
  { key: "colaborare-intre-agentii", name: "Colaborare între agenții", summary: "Împarți proprietăți cu alte agenții și stabiliți comisionul înainte de a lucra împreună.", category: "Clienți și vânzări", to: "/colaborare-intre-agentii", kind: "external" },
  { key: "comisioane-agenti-imobiliari", name: "Comisioane", summary: "Ții evidența comisioanelor pe agent și pe tranzacție, cu rapoarte și exporturi pentru agenție.", category: "Echipă și organizare", to: "/comisioane-agenti-imobiliari", kind: "external" },
  { key: "analiza-comparativa-de-piata", name: "Analiză comparativă de piață", summary: "Calculezi prețul corect al unei proprietăți din oferte comparabile și trimiți clientului un raport clar.", category: "Analize și documente", to: "/analiza-comparativa-de-piata", kind: "external" },
];

/** Module descrise pe /functionalitati, fără pagină dedicată încă. */
const SECTIONS: FeatureEntry[] = [
  { key: "proprietati", name: "Proprietăți", summary: "Fișă completă pentru fiecare proprietate, cu galerie foto, statusuri și filtre salvate.", category: "Portofoliu și publicare" },
  { key: "contacte", name: "Contacte", summary: "Fiecare client cu cererile, proprietățile, activitățile și notele lui, într-o singură fișă.", category: "Clienți și vânzări" },
  { key: "cereri", name: "Cereri", summary: "Ce caută clientul, în criterii clare: buget, zone, camere, suprafață și tip de proprietate.", category: "Clienți și vânzări" },
  { key: "lead-uri", name: "Lead-uri", summary: "Urmărești fiecare client potențial pe etape, de la primul contact până la tranzacție.", category: "Clienți și vânzări" },
  { key: "matching", name: "Potriviri automate", summary: "Vezi proprietățile potrivite pentru o cerere și clienții potriviți pentru o proprietate, cu motive.", category: "Clienți și vânzări" },
  { key: "activitati", name: "Activități", summary: "Apeluri, întâlniri, vizionări și sarcini, legate de client și proprietate, cu termen și responsabil.", category: "Echipă și organizare" },
  { key: "calendar", name: "Calendar", summary: "Vizionările și întâlnirile echipei într-o singură agendă, pe zile și săptămâni.", category: "Echipă și organizare" },
  { key: "obiective", name: "Obiective", summary: "Ținte lunare pentru fiecare agent, cu progres calculat din activitatea reală.", category: "Echipă și organizare" },
  { key: "dashboard", name: "Ecran de start", summary: "Agentul își vede agenda și lead-urile, iar administratorul vede toată agenția.", category: "Analize și documente" },
  { key: "rapoarte", name: "Rapoarte", summary: "Cifrele despre portofoliu, lead-uri și activitatea echipei, fără calcule de mână.", category: "Analize și documente" },
].map((s) => ({ ...s, category: s.category as FeatureCategory, to: "/functionalitati", hash: s.key, kind: "section" as const }));

const PAGE_ENTRIES: FeatureEntry[] = FEATURE_PAGES.map((p) => ({
  key: p.slug, name: p.name, summary: p.description, category: p.category, to: `/functionalitati/${p.slug}`, kind: "page",
}));

/** Subiectele pot avea un slug public diferit de cheia secțiunii. */
const SECTION_PAGE_SLUGS: Record<string, string> = { matching: "potriviri-automate", dashboard: "ecran-de-start" };

export function featurePageForSection(key: string): FeaturePage | null {
  return featurePageBySlug(SECTION_PAGE_SLUGS[key] ?? key);
}

/** Cuprinsul complet, fără dubluri între pagini și secțiuni. */
export const FEATURE_ENTRIES: FeatureEntry[] = (() => {
  const all = [...EXTERNAL, ...PAGE_ENTRIES, ...SECTIONS.filter((s) => !featurePageForSection(s.key))];
  return FEATURE_CATEGORIES.flatMap((c) => all.filter((e) => e.category === c));
})();

export function featureHref(e: FeatureEntry): string {
  return e.hash ? `${e.to}#${e.hash}` : e.to;
}

export function featurePageBySlug(slug: string): FeaturePage | null {
  return FEATURE_PAGES.find((p) => p.slug === slug) ?? null;
}

export function featureEntryByKey(key: string): FeatureEntry | null {
  return FEATURE_ENTRIES.find((e) => e.key === key) ?? null;
}

export const featurePaths = (): string[] => FEATURE_PAGES.map((p) => `/functionalitati/${p.slug}`);
