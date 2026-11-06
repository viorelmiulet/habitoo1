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
      { q: "Pot căuta atât proprietăți, cât și clienți?", a: "Da. Ai ambele sensuri: Cerere → Proprietăți și Proprietate → Clienți. Alegi punctul de pornire după ce lucrezi în acel moment. Dimineața poți porni de la cererile noi, iar când intră o ofertă în portofoliu, pornești de la ea și vezi pe cine să suni." },
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
    title: "Activități agenție imobiliară, organizate | Habitoo CRM",
    description: "Activități agenție imobiliară: apeluri, întâlniri, vizionări, sarcini și reveniri legate de client și proprietate, cu termen, responsabil și stare.",
    h1: "Toate activitățile agenției, legate de client și proprietate",
    intro: [
      "O zi de agent înseamnă zeci de lucruri mărunte: un apel promis, o vizionare, un email către proprietar, o revenire după o ofertă. Ținute în memorie sau pe bilețele, unele se pierd. Cu Habitoo, toate activitățile agenției imobiliare stau într-un singur loc, fiecare legată de clientul, proprietatea sau lead-ul la care se referă.",
      "Înregistrezi apeluri, întâlniri, vizionări, sarcini, emailuri, follow-up-uri și note. Fiecare are termen, responsabil și stare. Știi oricând ce ai de făcut azi, ce ai amânat și ce ai terminat.",
      "Câștigul se vede repede. Nu mai uiți reveniri, nu mai întrebi colegii ce s-a discutat și nu mai pierzi clienți din neatenție. Tot ce faci rămâne legat de fișa potrivită."
    ],
    benefits: [
      { title: "Context la fiecare pas", text: "O vizionare este legată de proprietate și de client. Un apel este legat de lead-ul pe care îl urmărești. Deschizi fișa și vezi ce a fost și ce urmează." },
      { title: "Termen, responsabil și stare", text: "Stabilești când se face activitatea și cine se ocupă. Starea arată ce este planificat, finalizat sau anulat. Lista ta de azi se scrie singură." },
      { title: "Filtre pe tip și stare", text: "Vezi doar vizionările, doar apelurile sau doar ce e încă planificat. Filtrezi și după agent sau perioadă. Găsești în câteva secunde ce trebuie închis." },
      { title: "Creare rapidă de oriunde", text: "Adaugi activitatea direct din proprietate, contact sau lead. Legătura cu fișa se face automat. Poți folosi și butonul de adăugare rapidă din orice ecran." },
      { title: "Istoric care rămâne", text: "Activitățile finalizate nu dispar. Rămân în istoricul clientului, al proprietății și al lead-ului. Oricine preia discuția știe exact de unde continuă." }
    ],
    steps: [
      { title: "Creezi activitatea din fișă", text: "Pornești din proprietate, contact sau lead și alegi tipul: apel, întâlnire, vizionare, sarcină, email, follow-up sau notă. Nu mai cauți fișa a doua oară, pentru că pornești chiar din locul în care lucrezi." },
      { title: "Stabilești termenul și responsabilul", text: "Alegi data, ora și agentul care se ocupă. Activitățile cu termen apar automat și în calendar. Așa vezi dintr-o privire și ziua ta, și programul colegilor cu care împarți clienții." },
      { title: "Lucrezi din lista de activități", text: "Filtrezi după tip, stare, agent sau perioadă. Vezi ce urmează azi și ce a rămas restant. Poți schimba starea mai multor activități deodată. Începi dimineața cu o listă clară și o închizi seara fără restanțe ascunse." },
      { title: "Marchezi ca finalizat", text: "După apel sau vizionare, marchezi activitatea ca finalizată. Ea intră în istoric, iar tu programezi imediat pasul următor. Clientul primește revenirea promisă, iar tu nu mai depinzi de memorie." }
    ],
    faq: [
      { q: "Ce tipuri de activități pot adăuga?", a: "Apeluri, întâlniri, vizionări, sarcini, emailuri, follow-up-uri și note. Tipul te ajută să filtrezi lista și să recunoști dintr-o privire ce ai de făcut. Fiecare activitate păstrează legătura cu fișa din care a pornit." },
      { q: "Unde văd activitățile unui client?", a: "În fișa contactului, lângă cererile, lead-urile și proprietățile lui. Aceleași activități apar și în fișa proprietății sau a lead-ului de care sunt legate. Din oricare dintre ele, ai același istoric complet." },
      { q: "Ce se întâmplă cu activitățile finalizate?", a: "Rămân în istoric. Nu le ștergi ca să faci ordine, ci le marchezi ca finalizate. Lista activităților planificate rămâne scurtă, iar evidența discuțiilor se păstrează. Când revii peste o lună la același client, găsești tot ce s-a întâmplat." },
      { q: "Pot vedea și activitățile colegilor?", a: "Da, lista se poate filtra după agent. Așa vezi cine are o vizionare programată sau o revenire de făcut și împărțiți mai ușor munca în echipă." }
    ],
    related: ["calendar", "contacte", "lead-uri", "proprietati", "dashboard"]
  },
  {
    slug: "calendar",
    name: "Calendar",
    category: "Echipă și organizare",
    title: "Calendar vizionări imobiliare pentru echipă | Habitoo CRM",
    description: "Calendar vizionări imobiliare pentru toată agenția: întâlnirile și vizionările pe zi, săptămână sau lună, pentru tine sau pentru fiecare agent din echipă.",
    h1: "Vizionările și întâlnirile echipei, într-o singură agendă",
    intro: [
      "În imobiliare, programul se mută des. Un client amână, un proprietar cere altă oră, un coleg are nevoie de cheie. Cu Habitoo ai un calendar al vizionărilor imobiliare comun pentru toată agenția, unde vezi fiecare întâlnire la locul ei.",
      "Nu completezi nimic de două ori. Vizionările programate din proprietate sau din lead apar automat în calendar, alături de apeluri, întâlniri și sarcini cu termen. Agenda zilei te așteaptă pe ecranul de start, imediat ce intri în aplicație.",
      "Agentul își planifică săptămâna în câteva minute. Administratorul vede cum sunt împărțite vizionările între colegi. Toată lumea lucrează după același program. Mai puține suprapuneri, mai puține telefoane de verificare și mai mult timp pentru clienți."
    ],
    benefits: [
      { title: "O agendă pentru tot ce ai programat", text: "Vizionări, întâlniri, apeluri și sarcini apar în același loc. Nu mai compari liste separate. Știi dintr-o privire dacă mai ai loc pentru o vizionare nouă." },
      { title: "Pe zi, pe săptămână sau pe lună", text: "Vederea pe zi îți arată detaliile unei zile aglomerate. Vederea pe săptămână te ajută să planifici. Pentru o imagine de ansamblu, treci pe lună." },
      { title: "Agenda ta sau a agenției", text: "Vezi doar activitățile tale sau pe ale întregii echipe. Filtrezi după agent și după tipul activității. Afli cine e liber fără să suni pe nimeni." },
      { title: "Muți programarea cu un gest", text: "O vizionare s-a amânat? O tragi pe altă zi sau la altă oră. Programarea se actualizează pentru toată echipa." }
    ],
    steps: [
      { title: "Programezi din fișă", text: "Din proprietate sau din lead programezi o vizionare, cu dată, oră și agent. Ea apare imediat în calendar. Clientul și proprietatea rămân legate de programare, deci ai detaliile la un click." },
      { title: "Alegi vederea", text: "Deschizi calendarul pe zi, săptămână sau lună. Alegi dacă vezi doar programul tău sau pe al agenției. Treci ușor de la o vedere la alta, după ce ai de organizat." },
      { title: "Pornești ziua de pe ecranul de start", text: "Agenda de azi apare imediat după autentificare. Vezi ce urmează fără să deschizi calendarul complet. Pornești ziua știind unde trebuie să ajungi și la ce oră." },
      { title: "Închizi activitatea după întâlnire", text: "Marchezi vizionarea ca finalizată. Ea rămâne în istoricul proprietății și al clientului, iar tu programezi pasul următor. Istoricul rămâne complet pentru tine și pentru colegi." }
    ],
    faq: [
      { q: "Ce apare în calendar?", a: "Activitățile cu termen: vizionări, întâlniri, apeluri, sarcini și reveniri. Le creezi din fișa proprietății, a contactului sau a lead-ului ori din lista de activități, iar calendarul le pune singur pe ziua lor. Nu introduci nimic de două ori." },
      { q: "Pot vedea programul colegilor?", a: "Da. Calendarul poate afișa activitățile întregii agenții, iar filtrul pe agent îți arată programul unui singur coleg. Evitați suprapunerile și împărțiți corect vizionările. Administratorul vede pe loc cum sunt împărțite vizionările." },
      { q: "Trebuie să deschid calendarul în fiecare dimineață?", a: "Nu neapărat. Agenda de azi apare pe ecranul de start. Deschizi calendarul complet doar când vrei să vezi alte zile sau toată săptămâna. Agenda de pe ecranul de start se bazează pe aceleași date ca și calendarul." },
      { q: "Ce fac dacă o vizionare se mută?", a: "O tragi pe noua zi sau oră ori schimbi data în activitate. Vizionarea rămâne legată de aceeași proprietate și de același client, deci istoricul nu se pierde, iar colegii văd imediat programul nou." }
    ],
    related: ["activitati", "proprietati", "lead-uri", "dashboard"]
  },
  {
    slug: "obiective",
    name: "Obiective",
    category: "Echipă și organizare",
    title: "Obiective agenți imobiliari, cu progres real | Habitoo CRM",
    description: "Obiective agenți imobiliari pe luni: lead-uri, vizionări, proprietăți noi, tranzacții sau comision, pe agent și pe agenție, cu progres calculat automat.",
    h1: "Obiective lunare pentru fiecare agent, cu progres real",
    intro: [
      "O țintă te ajută doar dacă știi, în timpul lunii, cât de aproape ești de ea. Dacă afli rezultatul abia la final, e prea târziu să schimbi ceva. Cu Habitoo stabilești obiectivele agenților imobiliari pe fiecare lună și vezi progresul pe tot parcursul ei.",
      "Alegi ținte pentru lead-uri, vizionări, proprietăți noi, tranzacții sau comision. Le stabilești pentru un agent sau pentru toată agenția. Progresul nu se completează de mână: se calculează din ce lucrează echipa în aplicație.",
      "Discuția despre rezultate pornește de la cifre, nu de la impresii. Agentul știe ce mai are de făcut până la final de lună. Agenția vede din timp unde e nevoie de sprijin. Iar fiecare agent are o direcție clară pentru fiecare zi de lucru."
    ],
    benefits: [
      { title: "Ținte pe care le înțelege toată lumea", text: "Fiecare obiectiv are un tip, o valoare și o lună. Agentul știe exact ce urmărește. Toată echipa citește aceleași cifre." },
      { title: "Progres din munca reală", text: "Lead-urile, vizionările, proprietățile noi și tranzacțiile din aplicație intră automat în calcul. Nu mai ții un tabel separat. Cifra afișată corespunde activității reale." },
      { title: "Pe agent și pe agenție", text: "Urmărești ținta fiecărui coleg și pe cea a întregii agenții. Vezi pe loc cine e aproape de țintă și cine are nevoie de ajutor." },
      { title: "Comisionul, ca țintă clară", text: "Un obiectiv de comision îți arată cât mai ai până la suma propusă. Știi dacă luna merge în direcția bună. Evidența detaliată a comisioanelor rămâne în secțiunea dedicată." }
    ],
    steps: [
      { title: "Stabilești obiectivul", text: "Alegi luna, tipul obiectivului și valoarea țintă. Îl atribui unui agent sau îl lași la nivelul agenției. Ținta e vizibilă pentru toată lumea din momentul în care o salvezi." },
      { title: "Lucrezi ca de obicei", text: "Adaugi proprietăți, programezi vizionări și muți lead-urile pe etape. Nu ai nimic în plus de completat. Fiecare proprietate nouă sau vizionare făcută contează automat pentru obiectiv." },
      { title: "Urmărești progresul", text: "Deschizi pagina de obiective și vezi cât s-a realizat din fiecare țintă. Dacă rămâi în urmă la jumătatea lunii, afli la timp. Ai timp să-ți reorganizezi agenda și să recuperezi." },
      { title: "Ajustezi pentru luna următoare", text: "Pornind de la ce s-a realizat, stabilești ținte noi, realiste, pentru fiecare agent și pentru agenție. Fiecare lună pornește de la cifre reale, nu de la estimări." }
    ],
    faq: [
      { q: "Pentru ce pot stabili obiective?", a: "Pentru lead-uri, vizionări, proprietăți noi, tranzacții sau comision. Fiecare obiectiv are o lună și o valoare țintă, iar progresul se raportează la ea. Alegi tipul care contează cel mai mult pentru luna respectivă." },
      { q: "Trebuie să introduc progresul de mână?", a: "Nu. Progresul se calculează din datele din aplicație. Când adaugi o proprietate, faci o vizionare sau câștigi o tranzacție, cifra obiectivului ține cont de ele. Cifra se actualizează pe măsură ce echipa lucrează." },
      { q: "Pot avea obiective și pentru toată agenția?", a: "Da. Un obiectiv poate fi al unui agent sau al agenției. Așa urmărești în paralel ținta echipei și contribuția fiecărui coleg. Fiecare agent își vede contribuția la rezultatul echipei." },
      { q: "Obiectivele înlocuiesc evidența comisioanelor?", a: "Nu. Obiectivul arată progresul față de ținta lunii. Sumele, împărțirea pe agenți și exporturile se țin în secțiunea de comisioane. Cele două se completează." }
    ],
    related: ["rapoarte", "dashboard", "activitati", "comisioane-agenti-imobiliari"]
  },
  {
    slug: "dashboard",
    name: "Ecran de start",
    category: "Analize și documente",
    title: "Dashboard agenție imobiliară, pe roluri | Habitoo CRM",
    description: "Dashboard agenție imobiliară diferit pentru agent și administrator: agenda de azi, pipeline-ul, portofoliul și indicatorii agenției, din primul ecran.",
    h1: "Un ecran de start pentru fiecare rol din agenție",
    intro: [
      "Primul ecran al dimineții trebuie să-ți spună ce ai de făcut, nu să te plimbe prin meniuri. În Habitoo, dashboard-ul agenției imobiliare se schimbă după rolul tău. Agentul își vede ziua, iar administratorul vede toată agenția.",
      "Sus găsești indicatorii principali: proprietăți active, lead-uri noi din ultimele 30 de zile, vizionările de azi și tranzacțiile câștigate. Dedesubt, agenda zilei și proprietățile adăugate recent. Restul ecranului e construit pentru rolul tău.",
      "Deschizi aplicația și știi imediat ce urmează. Pornești de aici spre fișa de care ai nevoie, fără să pierzi timp căutând. Mai puțin timp pierdut, mai multe apeluri făcute la timp și o zi mai bine organizată."
    ],
    benefits: [
      { title: "Agentul își vede ziua", text: "Vezi ce ai de făcut azi, pipeline-ul tău și portofoliul tău. Anunțurile care au nevoie de atenție apar separat. La fel și propunerile de colaborare în așteptare." },
      { title: "Administratorul vede agenția", text: "Vezi pipeline-ul pe agenți, portofoliile fiecăruia și sănătatea portofoliului. Urmărești portalurile, conversia din ultimele 30 de zile și echipa. Afli repede unde se blochează lucrurile." },
      { title: "Indicatori dintr-o privire", text: "Proprietățile active, lead-urile noi, vizionările de azi și tranzacțiile câștigate sunt primele cifre pe care le vezi. Un click te duce la lista din spatele fiecărei cifre." },
      { title: "Adăugare rapidă și căutare globală", text: "Din orice ecran adaugi un contact, un lead, o cerere, un contract, o activitate sau o vizionare. Căutarea globală găsește clientul sau proprietatea în câteva secunde." }
    ],
    steps: [
      { title: "Intri în aplicație", text: "După autentificare ajungi direct pe ecranul potrivit rolului tău. Nu trebuie să configurezi nimic. Ajungi direct la informațiile de care ai nevoie în acea zi." },
      { title: "Citești agenda și indicatorii", text: "Vezi vizionările și întâlnirile de azi, cifrele principale și pipeline-ul pe scurt. Știi în câteva secunde ce urmează și ce e prioritar." },
      { title: "Treci la lucru din același loc", text: "Deschizi activitatea, lead-ul sau proprietatea care te interesează. Adaugi tot ce apare pe parcurs cu butonul de adăugare rapidă. Nu pierzi timp navigând înapoi doar ca să notezi un client nou." },
      { title: "Revii între întâlniri", text: "Te întorci pe ecranul de start ca să vezi ce a rămas din ziua ta și ce s-a schimbat în agenție. Cifrele se bazează pe datele actuale din aplicație." }
    ],
    faq: [
      { q: "De ce văd altceva decât colegul meu?", a: "Ecranul de start depinde de rol. Agentul își vede ziua, pipeline-ul și portofoliul propriu. Administratorul vede agenția pe agenți, portalurile și echipa. Fiecare primește informațiile cu care lucrează zilnic, fără să le caute." },
      { q: "Ce indicatori apar?", a: "Proprietățile active, lead-urile noi din ultimele 30 de zile, vizionările de azi și tranzacțiile câștigate în ultimele 30 de zile. Pentru analize detaliate, pe perioadă și agent, folosești rapoartele. Fiecare cifră duce la lista de înregistrări din spatele ei." },
      { q: "Pot căuta un client fără să părăsesc ecranul?", a: "Da. Căutarea globală și adăugarea rapidă sunt disponibile din orice ecran. Găsești un client, o proprietate sau un lead și îl deschizi direct. Nu mai treci prin meniuri pentru o informație rapidă." },
      { q: "Ce vede administratorul agenției?", a: "Pipeline-ul pe agenți, portofoliile fiecăruia, sănătatea portofoliului, portalurile și conversia din ultima lună. Pentru detalii pe fiecare agent, deschide rapoartele sau pagina echipei. Așa afli repede unde se blochează vânzările și cine are nevoie de sprijin." }
    ],
    related: ["calendar", "rapoarte", "lead-uri", "echipa-si-roluri"]
  },
  {
    slug: "rapoarte",
    name: "Rapoarte",
    category: "Analize și documente",
    title: "Rapoarte agenție imobiliară, fără calcule | Habitoo CRM",
    description: "Rapoarte agenție imobiliară despre portofoliu, sursele și etapele lead-urilor și activitatea agenților, cu filtre pe perioadă și agent și descărcare.",
    h1: "Cifrele agenției, fără calcule de mână",
    intro: [
      "Deciziile bune pornesc de la cifre corecte. Dacă le aduni la final de lună din tabele separate, pierzi timp și greșești ușor. În Habitoo, rapoartele agenției imobiliare se calculează din ce lucrați zilnic în aplicație.",
      "Vezi portofoliul pe stări, lead-urile pe surse și pe etape, activitatea pe săptămâni și rezultatele fiecărui agent. Alegi perioada și agentul, iar cifrele se schimbă pe loc.",
      "Administratorul vede agenția în ansamblu. Agentul înțelege de unde vin clienții lui și unde se opresc. Toți pornesc de la aceleași date, introduse o singură dată. Deciziile despre surse de clienți, portofoliu și echipă devin mai simple."
    ],
    benefits: [
      { title: "Portofoliul, pe stări", text: "Vezi câte proprietăți sunt active, rezervate, vândute sau închiriate. Știi ce ai de oferit și unde ai nevoie de proprietăți noi. Planifici din timp prospectarea." },
      { title: "De unde vin clienții", text: "Raportul surselor arată ce canale aduc lead-uri. Vezi ce merită păstrat și unde să pui mai mult efort. Bugetul de promovare merge acolo unde aduce clienți." },
      { title: "Unde se opresc vânzările", text: "Numărul de lead-uri pe fiecare etapă îți arată unde rămân clienții. Știi exact ce parte a procesului trebuie îmbunătățită." },
      { title: "Activitatea echipei", text: "Vezi activitățile pe săptămâni și un tabel pe agenți. Discuțiile cu echipa pornesc de la cifre reale, nu de la estimări." },
      { title: "Descarci tabelele", text: "Fiecare raport se descarcă într-un fișier pe care îl deschizi în Excel. Îl trimiți mai departe sau îl păstrezi pentru ședința lunară." }
    ],
    steps: [
      { title: "Lucrezi în aplicație", text: "Adaugi proprietăți, înregistrezi lead-urile cu sursa lor și finalizezi activități. Aceste date sunt baza rapoartelor. Nu completezi nimic separat pentru rapoarte." },
      { title: "Alegi perioada și agentul", text: "Luna aceasta, ultimele 3 sau 6 luni, ultimul an sau un interval ales de tine. Poți restrânge la un agent sau la o sursă de lead-uri. Poți compara ușor două perioade sau doi agenți." },
      { title: "Citești cifrele", text: "Treci prin portofoliu, surse, etape, activitate și agenți. Fiecare grafic arată situația din perioada aleasă. Vezi imediat ce merge bine și ce trebuie schimbat." },
      { title: "Descarci ce îți trebuie", text: "Salvezi tabelul de care ai nevoie și îl folosești la ședință sau la planificarea lunii următoare. Așa urmărești luna de luna dacă schimbările au avut efect." }
    ],
    faq: [
      { q: "Ce rapoarte am la dispoziție?", a: "Proprietăți pe stări, lead-uri pe surse și pe etape, activitatea pe săptămâni și un tabel pe agenți. Pentru comisioane există o secțiune separată, cu rapoarte și exporturi proprii. Toate pornesc de la aceleași date, introduse o singură dată." },
      { q: "Pot filtra după perioadă și agent?", a: "Da. Alegi luna aceasta, ultimele 3 sau 6 luni, ultimul an sau un interval propriu. Poți vedea toată agenția sau un singur agent și poți filtra lead-urile după sursă. Cifrele se schimbă pe loc când alegi alt filtru." },
      { q: "Pot descărca rapoartele?", a: "Da. Fiecare tabel se descarcă separat, într-un fișier care se deschide în Excel sau în orice program de calcul tabelar. Îl poți trimite colegilor sau îl poți păstra pentru ședința lunară." },
      { q: "Trebuie să pregătesc datele înainte?", a: "Nu. Rapoartele folosesc datele pe care le introduci oricum. Cu cât completezi mai atent sursa lead-urilor și stările proprietăților, cu atât cifrele spun mai mult. Rapoartele devin mai utile pe măsură ce echipa lucrează consecvent în aplicație." }
    ],
    related: ["dashboard", "obiective", "lead-uri", "comisioane-agenti-imobiliari"]
  },
  {
    slug: "contracte",
    name: "Contracte",
    category: "Analize și documente",
    title: "Contracte agenție imobiliară, din CRM | Habitoo CRM",
    description: "Contracte agenție imobiliară completate din datele clientului și ale proprietății, cu scanarea actului de identitate și semnare pe ecran, păstrate în CRM.",
    h1: "Contractele agenției, generate și semnate din CRM",
    intro: [
      "Un contract scris de mână la fiecare vizionare costă timp și aduce greșeli. Numele greșit, CNP-ul incomplet, adresa copiată prost. Cu Habitoo, contractele agenției imobiliare se completează din datele pe care le ai deja în aplicație.",
      "Ai cinci tipuri de documente: contract de închiriere, de reprezentare exclusivă, de comision, de comodat și de vizionare. Datele agenției, ale agentului, ale clientului și ale proprietății intră singure în text.",
      "Fotografiezi actul de identitate al clientului, iar datele lui se completează automat. Apoi trimiți fiecărei părți un link de semnare. Contractul semnat rămâne în aplicație, gata de descărcat. Mai puțin timp pierdut cu hârtiile și mai mult timp pentru client."
    ],
    benefits: [
      { title: "Cinci tipuri de contract, gata de folosit", text: "Închiriere, reprezentare exclusivă, comision, comodat și vizionare. Alegi tipul potrivit și pornești de la un text complet. Nu mai cauți ultimul model folosit." },
      { title: "Date completate din fișe", text: "Datele agenției, ale agentului responsabil, ale clientului și ale proprietății intră automat în contract. Scrii mai puțin și eviți greșelile de copiere." },
      { title: "Actul de identitate, scanat", text: "Fotografiezi buletinul, cartea electronică de identitate, pașaportul sau permisul de ședere ori încarci o poză. Datele se completează singure. Tu doar le verifici." },
      { title: "Semnare pe ecran", text: "Creezi linkuri de semnare pentru părțile contractului. Fiecare semnează pe ecranul telefonului sau al calculatorului. Vezi în aplicație cine a semnat și când." },
      { title: "Numerotare și evidență", text: "Contractele primesc numere pe fiecare an și tip. Toate stau într-o listă comună, cu stare și dată. Găsești oricând documentul de care ai nevoie." }
    ],
    steps: [
      { title: "Alegi tipul de contract", text: "Pornești din lista de contracte sau din butonul de adăugare rapidă și alegi documentul potrivit. Ai în față un text complet, gata de completat." },
      { title: "Legi clientul și proprietatea", text: "Datele lor intră în text. Pentru client, fotografiezi sau încarci actul de identitate și verifici ce s-a completat. Scrii mai puțin și eviți greșelile de copiere a datelor." },
      { title: "Trimiți la semnare", text: "Creezi linkurile de semnare pentru fiecare parte. Nota de informare privind datele personale se atașează la final. Vezi în fișa contractului cine a semnat și cine mai are de semnat." },
      { title: "Păstrezi contractul semnat", text: "După semnare, contractul rămâne în aplicație, cu data semnării, și îl descarci oricând. Nu mai cauți hârtii prin dosare când ai nevoie de un document." }
    ],
    faq: [
      { q: "Ce tipuri de contract pot genera?", a: "Contract de închiriere, de reprezentare exclusivă, de comision, de comodat și de vizionare. Fiecare pornește de la un text complet, completat cu datele din aplicație. Alegi tipul potrivit și pornești imediat." },
      { q: "Cum se completează datele clientului?", a: "Fotografiezi actul de identitate cu telefonul sau încarci o poză. Datele se completează automat. Le verifici înainte de a trimite contractul, pentru că o poză neclară poate fi citită greșit. Datele agenției, ale agentului și ale proprietății intră și ele automat." },
      { q: "Cum semnează clientul?", a: "Primește un link de semnare și semnează direct pe ecran. În fișa contractului vezi cine a semnat și cine mai are de semnat. Nu e nevoie să vă întâlniți doar pentru semnătură." },
      { q: "Unde găsesc contractele semnate?", a: "În lista de contracte, fiecare cu numărul, tipul, starea și data semnării. Le deschizi și le descarci oricând ai nevoie. Ai toată evidența contractelor agenției într-un singur loc." }
    ],
    related: ["contacte", "proprietati", "aplicatie-mobil", "comisioane-agenti-imobiliari"]
  },
  {
    slug: "echipa-si-roluri",
    name: "Echipă și roluri",
    category: "Echipă și organizare",
    title: "CRM pentru echipa agenției imobiliare | Habitoo CRM",
    description: "CRM pentru echipa agenției imobiliare: inviți colegii, fiecare are rolul lui, iar proprietățile și lead-urile sunt atribuite pe agent, cu drepturi clare.",
    h1: "Toată echipa agenției, cu drepturi clare pentru fiecare rol",
    intro: [
      "O agenție crește cu fiecare coleg nou. Dar fără reguli clare, apar întrebări: cine se ocupă de client, cine poate muta o proprietate, cine vede cifrele. Habitoo este un CRM pentru echipa agenției imobiliare, în care fiecare are rolul și locul lui.",
      "Inviți colegii prin email, iar ei intră direct în agenția ta. Există două roluri: administrator de agenție și agent. Fiecare proprietate și fiecare lead are un agent responsabil.",
      "Agentul lucrează liniștit pe clienții și proprietățile lui. Administratorul vede toată agenția și decide cum se împarte munca. Toată lumea știe cine răspunde de ce, iar clienții nu mai cad între colegi. Echipa lucrează mai repede, cu mai puține întrebări. Mai puține neînțelegeri, mai puțini clienți pierduți între colegi și o agenție mai ușor de condus."
    ],
    benefits: [
      { title: "Inviți colegii în câteva secunde", text: "Trimiți invitația pe email, din pagina echipei. Vezi cine a acceptat și cine mai are invitația deschisă. Echipa se formează fără complicații." },
      { title: "Două roluri, ușor de înțeles", text: "Administratorul de agenție conduce contul și echipa. Agentul lucrează cu proprietățile, clienții și activitățile lui. Fiecare vede ecranul potrivit rolului." },
      { title: "Un responsabil pentru fiecare ofertă", text: "Fiecare proprietate și fiecare lead are un agent responsabil. Administratorul poate muta proprietățile de la un agent la altul. Pe portalurile active se actualizează și datele de contact." },
      { title: "Administratorul vede agenția", text: "Pe ecranul de start vede pipeline-ul pe agenți, portofoliile fiecăruia și echipa. În pagina echipei vede colegii activi, inactivi și invitațiile." },
      { title: "Comisioane cu reguli clare", text: "Fiecare agent își vede comisioanele. Administratorul vede toată agenția și poate aloca sume. Alocările lui nu pot fi modificate de agenți." }
    ],
    steps: [
      { title: "Inviți echipa", text: "Din pagina echipei trimiți invitații pe email. Colegii își creează contul și intră direct în agenție. Nu e nevoie de configurări complicate pentru fiecare coleg nou." },
      { title: "Atribui proprietățile și lead-urile", text: "Alegi agentul responsabil pentru fiecare ofertă și fiecare client potențial. Administratorul mută proprietățile când e nevoie. Fiecare client are de la început pe cineva care răspunde de el." },
      { title: "Fiecare lucrează pe partea lui", text: "Agentul își vede ziua, pipeline-ul și portofoliul. Administratorul urmărește agenția în ansamblu. Nimeni nu se încurcă în munca celuilalt." },
      { title: "Urmărești rezultatele", text: "Folosești rapoartele și obiectivele pentru a vedea activitatea fiecărui agent și a agenției. Discuțiile cu echipa pornesc de la cifre reale." }
    ],
    faq: [
      { q: "Ce roluri există?", a: "Administrator de agenție și agent. Administratorul gestionează echipa și vede toată agenția. Agentul lucrează cu proprietățile, clienții și activitățile lui. Fiecare vede ecranul potrivit rolului lui." },
      { q: "Cum adaug un coleg?", a: "Din pagina echipei trimiți o invitație pe email. Colegul își creează contul și intră direct în agenția ta. Vezi în listă invitațiile încă neacceptate. Echipa se formează în câteva minute." },
      { q: "Cine poate muta o proprietate la alt agent?", a: "Doar administratorul agenției. La mutare, datele de contact se actualizează pe portalurile pe care proprietatea este publicată. Așa se păstrează regulile agenției și datele corecte pe portaluri." },
      { q: "Unde văd toată echipa?", a: "În pagina echipei. Acolo vezi colegii activi și inactivi, invitațiile încă neacceptate și agenții care nu au completat telefonul. Fiecare coleg are și o pagină proprie. Ai o imagine clară a echipei în orice moment." }
    ],
    related: ["dashboard", "obiective", "rapoarte", "comisioane-agenti-imobiliari", "colaborare-intre-agentii"]
  },
  {
    slug: "aplicatie-mobil",
    name: "Habitoo pe telefon",
    category: "Echipă și organizare",
    title: "CRM imobiliar pe telefon, pe teren | Habitoo CRM",
    description: "CRM imobiliar pe telefon: adaugi rapid clienți și vizionări, fotografiezi actele, schimbi etapa lead-ului și îți vezi agenda, direct din browserul telefonului.",
    h1: "Habitoo pe telefon, la vizionare și pe teren",
    intro: [
      "Agentul imobiliar stă puțin la birou. Vizionările, întâlnirile cu proprietarii și apelurile se întâmplă pe drum. Cu Habitoo ai CRM-ul imobiliar pe telefon, cu tot ce îți trebuie între două întâlniri.",
      "Deschizi Habitoo în browserul telefonului și te autentifici cu același cont. Jos ai o bară cu Acasă, Proprietăți, Lead-uri și butonul plus. Ecranele se așază pe lățimea telefonului, cu butoane ușor de apăsat.",
      "Notezi clientul nou chiar la vizionare. Fotografiezi actul de identitate pentru contract. Schimbi etapa lead-ului imediat după discuție. Totul ajunge pe loc la colegi. Când te întorci la birou, nu ai nimic de recuperat. Iar clientul vede un agent organizat, care răspunde repede. Lucrezi la fel de bine pe teren ca la birou, iar seara nu mai ai nimic de recopiat."
    ],
    benefits: [
      { title: "Adaugi rapid cu butonul plus", text: "Din bara de jos adaugi un contact, un lead, o cerere, un contract, o activitate sau o vizionare. Câteva câmpuri și ai terminat. Nu mai notezi pe hârtie ca să copiezi seara." },
      { title: "Fotografiezi actele pe loc", text: "Pentru contract, fotografiezi actul de identitate cu camera telefonului. Datele clientului se completează automat. Tu doar le verifici." },
      { title: "Lead-ul, la zi după fiecare discuție", text: "Pe telefon schimbi etapa lead-ului dintr-o simplă selecție. Notezi ce ai aflat și programezi pasul următor. Colegii văd imediat unde ai ajuns." },
      { title: "Agenda zilei, mereu la tine", text: "Pe ecranul de start vezi vizionările și întâlnirile de azi. Calendarul complet e la un click. Știi unde trebuie să ajungi și la ce oră." }
    ],
    steps: [
      { title: "Deschizi Habitoo pe telefon", text: "Intri din browserul telefonului cu contul tău. Nu ai nimic de instalat. Același cont, aceleași date ca pe calculator." },
      { title: "Verifici agenda", text: "Ecranul de start îți arată ce ai azi. Deschizi vizionarea și vezi proprietatea și clientul. Ai toate detaliile întâlnirii înainte să suni la ușă." },
      { title: "Notezi pe loc", text: "Cu butonul plus adaugi contactul, cererea sau următoarea vizionare. Pentru contract, fotografiezi actul de identitate. Nu mai amâni notițele până ajungi la birou." },
      { title: "Actualizezi lead-ul", text: "Alegi etapa nouă și adaugi o notă. Totul e salvat înainte să pleci de la întâlnire. Colegii văd imediat unde ai ajuns cu clientul." }
    ],
    faq: [
      { q: "Trebuie să instalez o aplicație?", a: "Nu. Habitoo funcționează în browserul telefonului, cu același cont ca pe calculator. Nu există, deocamdată, o aplicație separată în magazinele de aplicații." },
      { q: "Ce pot face de pe telefon?", a: "Adaugi contacte, lead-uri, cereri, contracte, activități și vizionări. Schimbi etapa lead-urilor, îți vezi agenda și cauți orice client sau proprietate. Ai la tine tot ce îți trebuie între două întâlniri." },
      { q: "Pot fotografia actul de identitate cu telefonul?", a: "Da. La contract alegi fotografierea actului, iar camera telefonului se deschide. Datele se completează automat și le verifici înainte de a merge mai departe. Poți și încărca o poză făcută mai devreme, dacă preferi." },
      { q: "Colegii văd imediat ce adaug?", a: "Da. Tot ce salvezi pe telefon ajunge în aceeași agenție. Colegii văd lead-ul actualizat sau vizionarea nouă fără să le mai spui tu. Administratorul vede și el situația la zi, pe ecranul de start. Nu mai trimiți mesaje separate ca să anunți ce s-a schimbat." }
    ],
    related: ["dashboard", "lead-uri", "contracte", "calendar", "activitati"]
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
const SECTION_PAGE_SLUGS: Record<string, string> = { matching: "potriviri-automate", dashboard: "dashboard" };

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

/** Adrese vechi ale paginilor dedicate, redirecționate permanent. */
export const FEATURE_PAGE_ALIASES: Record<string, string> = { "ecran-de-start": "dashboard" };

export function featurePageBySlug(slug: string): FeaturePage | null {
  return FEATURE_PAGES.find((p) => p.slug === slug) ?? null;
}

export function featureEntryByKey(key: string): FeatureEntry | null {
  return FEATURE_ENTRIES.find((e) => e.key === key) ?? null;
}

export const featurePaths = (): string[] => FEATURE_PAGES.map((p) => `/functionalitati/${p.slug}`);
