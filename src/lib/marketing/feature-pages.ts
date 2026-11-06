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
    "slug": "proprietati",
    "name": "Proprietăți",
    "category": "Portofoliu și publicare",
    "title": "Program gestiune proprietăți imobiliare | Habitoo CRM",
    "description": "Program gestiune proprietăți imobiliare pentru agenția ta: fișe complete, fotografii ordonate, filtre salvate și publicare pe portaluri din același loc.",
    "h1": "Gestiunea proprietăților agenției, într-o singură fișă",
    "intro": [
      "Într-un program gestiune proprietăți imobiliare, ai nevoie să găsești rapid atât oferta, cât și contextul ei. În Habitoo, lucrezi cu o fișă pentru fiecare proprietate: păstrezi datele de prezentare, fotografiile, proprietarul și activitățile legate de ofertă. Când revii după o discuție sau înaintea unei vizionări, deschizi aceeași fișă și verifici informațiile existente.",
      "Completezi tipul proprietății, tranzacția, prețul, suprafața, camerele, etajul, anul, zona, facilitățile și descrierea. Legi oferta de proprietar și urmărești starea ei în portofoliu. Pentru prezentare și publicare folosești datele din această fișă, fără să construiești o evidență paralelă pentru fiecare loc în care vrei să apară anunțul."
    ],
    "benefits": [
      {
        "title": "Datele ofertei, păstrate împreună",
        "text": "Verifici caracteristicile proprietății înainte să o propui unui client. Tipul, tranzacția, suprafețele și localizarea îți arată ce prezinți, iar facilitățile și descrierea completează informațiile. Legătura cu proprietarul păstrează oferta în contextul relației cu acel contact. Actualizezi fișa când primești informații noi, în loc să te bazezi pe o notă mai veche."
      },
      {
        "title": "Fotografii în ordinea aleasă de tine",
        "text": "Încarci imaginile în galeria proprietății și le reordonezi pentru prezentare. Prima fotografie devine fotografia principală, astfel încât alegi imaginea care reprezintă oferta în listă. Poți verifica întreaga galerie din proprietate și păstrezi împreună imaginile și datele pe care le vei folosi atunci când pregătești anunțul pentru publicare."
      },
      {
        "title": "Stări care reflectă situația proprietății",
        "text": "Urmărești oferta prin stările draft, activ, rezervat, în negociere, vândut, închiriat, expirat și arhivat. Schimbi starea în funcție de situația reală, nu pentru a înlocui o notă. Astfel, când cauți o proprietate sau revii la portofoliu, vezi dacă mai este disponibilă ori dacă discuția a avansat."
      },
      {
        "title": "Căutare și vederi pentru portofoliul tău",
        "text": "Cauți proprietăți și restrângi lista prin filtre. Sortezi rezultatele și salvezi vederile pe care le folosești frecvent, ca să revii la aceeași selecție. Adaugi ofertele importante la favorite și poți filtra după ele. Lucrezi astfel cu proprietățile relevante pentru discuția curentă, fără să parcurgi de fiecare dată întregul portofoliu."
      },
      {
        "title": "Activități și publicare din aceeași fișă",
        "text": `Programezi activități și vizionări din proprietate, păstrând legătura cu oferta despre care discuți. Din fila Publicare alegi portalurile active ale agenției și urmărești rezultatul trimiterii. Habitoo are integrări cu ${portalsLabel(publicPortalCount())} imobiliare; pagina integrărilor îți arată separat ce permite fiecare portal și cum îl activezi pentru agenție.`
      }
    ],
    "steps": [
      {
        "title": "Completezi proprietatea",
        "text": "Introduci datele ofertei și legi proprietarul. Verifici tranzacția, localizarea și caracteristicile înainte de a folosi fișa în discuțiile cu clienții. Descrierea și facilitățile rămân alături de câmpurile principale, pentru a putea reveni la ele când pregătești prezentarea."
      },
      {
        "title": "Pregătești galeria",
        "text": "Încarci fotografiile, verifici imaginile și le așezi în ordinea dorită. Pui prima fotografia pe care vrei să o folosești ca imagine principală. Când revii la proprietate, galeria rămâne parte din aceeași fișă, nu o colecție separată de datele ofertei."
      },
      {
        "title": "Organizezi lucrul cu oferta",
        "text": "Alegi starea potrivită și folosești filtrele, vederile salvate sau favoritele pentru a regăsi proprietatea. Când stabilești o discuție ori o vizionare, creezi activitatea din fișă. Păstrezi astfel legătura dintre ceea ce ai de făcut și proprietatea implicată."
      },
      {
        "title": "Alegi unde publici",
        "text": "Deschizi fila Publicare și selectezi portalurile disponibile agenției. Verifici starea publicării în Habitoo și consulți pagina integrărilor pentru modul de actualizare și retragere. La vânzare, închiriere sau arhivare, retragerea urmează regulile portalurilor, fără republicare automată."
      }
    ],
    "faq": [
      {
        "q": "Ce informații păstrez în fișa proprietății?",
        "a": "Păstrezi tipul, tranzacția, prețul, suprafața, camerele, etajul, anul, zona, facilitățile, descrierea și proprietarul, alături de fotografii și activități. Când deschizi oferta, folosești aceste informații împreună, fără să cauți caracteristicile într-o evidență și imaginile în alta."
      },
      {
        "q": "Cum aleg fotografia principală?",
        "a": "Reordonezi fotografiile în galerie și așezi pe prima poziție imaginea dorită. Prima fotografie este principală. Poți verifica ordinea înainte de publicare, astfel încât prezentarea ofertei să pornească de la imaginea pe care ai ales-o pentru proprietate."
      },
      {
        "q": "Pot reveni la filtrele pe care le folosesc des?",
        "a": "Da. Salvezi vederi pentru lista proprietăților și revii la selecțiile tale. Favoritele te ajută să păstrezi la îndemână anumite oferte. Căutarea, filtrele și sortarea rămân disponibile atunci când vrei să restrângi sau să schimbi lista."
      },
      {
        "q": "Unde verific portalurile disponibile?",
        "a": "Deschizi pagina Integrări pentru lista portalurilor și detaliile fiecăruia. În proprietate alegi unde publici dintre portalurile active ale agenției. Nu presupui că toate funcționează identic: verifici pe pagina dedicată cum se activează, cum se actualizează și cum se retrage anunțul."
      }
    ],
    "related": [
      "contacte",
      "cereri",
      "potriviri-automate",
      "integrari"
    ]
  },
  {
    "slug": "contacte",
    "name": "Contacte",
    "category": "Clienți și vânzări",
    "title": "CRM clienți agenție imobiliară | Habitoo CRM",
    "description": "CRM clienți agenție imobiliară: păstrezi contacte, surse, cereri, lead-uri, proprietăți, activități și note, cu legături directe în fișa fiecărui client.",
    "h1": "Toți clienții agenției, cu istoricul complet",
    "intro": [
      "Când cauți un CRM clienți agenție imobiliară, ai nevoie de mai mult decât o listă de numere de telefon. În Habitoo, deschizi fișa contactului și vezi relația cu agenția: ce caută, ce proprietăți deține, ce discuții urmărești și ce activități ai înregistrat. Revii la client cu informațiile deja păstrate în aplicație, nu doar cu amintirea ultimei conversații.",
      "Lucrezi cu proprietari, cumpărători, chiriași, investitori și parteneri. Folosești tipul și sursa contactului pentru a organiza lista, iar legăturile către cereri, lead-uri și proprietăți păstrează contextul. Când aceeași persoană este implicată în mai multe discuții, urmărești fiecare legătură din fișa ei, fără să confunzi clientul cu o singură ofertă sau cerere."
    ],
    "benefits": [
      {
        "title": "Tipuri de contact pentru relații diferite",
        "text": "Alegi tipul potrivit relației pe care o ai cu persoana: proprietar, cumpărător, chiriaș, investitor sau partener. Folosești aceste tipuri pentru segmentare și filtrare. Când revii la listă, poți căuta categoria relevantă pentru activitatea ta, fără să deduci rolul fiecăruia numai din notele pe care le-ai scris."
      },
      {
        "title": "Sursa contactului rămâne vizibilă",
        "text": "Păstrezi proveniența contactului și filtrezi lista după sursă. Poți deosebi o recomandare de un contact venit de pe un portal sau dintr-o discuție telefonică. Informația despre sursă rămâne alături de client, astfel încât continui relația cunoscând contextul în care a început, fără să îl reconstruiești din conversații separate."
      },
      {
        "title": "Cereri și lead-uri legate de client",
        "text": "Din fișa contactului ajungi direct la cererile și lead-urile asociate. Cererea îți arată criteriile de căutare, iar lead-ul păstrează etapa discuției. Nu înlocuiești una cu cealaltă: le consulți împreună pentru a vedea atât ce dorește clientul, cât și unde ai ajuns cu el în procesul de vânzare."
      },
      {
        "title": "Proprietăți și activități în același context",
        "text": "Vezi proprietățile deținute și activitățile legate de contact. Când discuți cu un proprietar, poți ajunge la oferta lui; când pregătești o vizionare, păstrezi legătura cu clientul. Activitățile și vizionările din fișă te ajută să urmărești ce ai programat și ce ai înregistrat deja în relația respectivă."
      },
      {
        "title": "Note pentru continuarea discuțiilor",
        "text": "Adaugi note la contact pentru informațiile care nu țin de criteriile unei cereri sau de caracteristicile unei proprietăți. Le consulți la următoarea discuție, alături de activități și legăturile existente. Astfel, separi observațiile despre relație de datele ofertelor și poți reveni la context fără să cauți o notă în fiecare modul."
      }
    ],
    "steps": [
      {
        "title": "Adaugi contactul și proveniența",
        "text": "Completezi datele clientului, alegi tipul de contact și păstrezi sursa. Verifici informațiile înainte să le folosești în discuții. În fișă poți păstra și informațiile despre acordul clientului, separat de tipul lui și de motivul pentru care a contactat agenția."
      },
      {
        "title": "Legi cererile și proprietățile",
        "text": "Asociezi contactului cererea care descrie ce caută sau proprietatea pe care o deține. Folosești legăturile directe pentru a deschide informațiile respective. Nu treci criteriile doar într-o notă, dacă vrei să le folosești apoi pentru potriviri cu portofoliul."
      },
      {
        "title": "Înregistrezi activitățile și notele",
        "text": "Din fișa contactului poți crea o activitate, o vizionare sau o cerere. Păstrezi notele relevante despre discuție și revii la ele când pregătești următorul contact. Informațiile rămân legate de persoană, chiar dacă lucrezi în paralel cu mai multe proprietăți."
      },
      {
        "title": "Revii la client cu istoricul la îndemână",
        "text": "Cauți contactul sau restrângi lista prin filtre, apoi deschizi fișa. Verifici cererile, lead-urile, proprietățile și activitățile asociate înainte să continui discuția. Folosești aceeași evidență pentru a urmări relația, în loc să tratezi fiecare revenire ca pe un contact nou."
      }
    ],
    "faq": [
      {
        "q": "Pot păstra proprietari și cumpărători în aceeași listă?",
        "a": "Da. Folosești tipurile de contact pentru a deosebi proprietarii, cumpărătorii, chiriașii, investitorii și partenerii. Filtrezi lista după tip când ai nevoie de o selecție anume, iar fiecare contact își păstrează propria fișă și propriile legături."
      },
      {
        "q": "Ce găsesc în istoricul clientului?",
        "a": "Consulți activitățile, vizionările și notele, alături de cereri, lead-uri și proprietățile deținute. Deschizi legăturile directe pentru detaliile fiecărei discuții sau oferte. Istoricul te ajută să continui relația folosind informațiile pe care le-ai înregistrat deja."
      },
      {
        "q": "Care este diferența dintre contact și lead?",
        "a": "Contactul reprezintă persoana și contextul relației cu agenția. Lead-ul urmărește o discuție comercială și etapa ei. Din fișa contactului ajungi la lead-urile asociate, fără să reduci întreaga relație cu clientul la starea unei singure discuții."
      },
      {
        "q": "Unde păstrez ce caută clientul?",
        "a": "Folosești o cerere legată de contact pentru buget, zone și celelalte criterii. Notele rămân potrivite pentru contextul discuției. Când criteriile sunt într-o cerere, le poți folosi pentru potrivirile cu proprietățile, iar din contact revii direct la acea cerere."
      }
    ],
    "related": [
      "proprietati",
      "cereri",
      "lead-uri",
      "potriviri-automate"
    ]
  },
  {
    "slug": "cereri",
    "name": "Cereri",
    "category": "Clienți și vânzări",
    "title": "Evidență cereri clienți imobiliare | Habitoo CRM",
    "description": "Evidență cereri clienți imobiliare cu buget, zone, camere și suprafață: organizezi criteriile, verifici potrivirile și păstrezi legătura cu fiecare contact.",
    "h1": "Cererile clienților, transformate în criterii clare",
    "intro": [
      "O evidență cereri clienți imobiliare îți este utilă atunci când poți folosi informațiile din discuție, nu doar să le recitești. În Habitoo, păstrezi cererea în câmpuri separate: tipul căutării, bugetul, zonele, camerele, suprafața și tipul proprietății. Revii la aceste criterii când verifici portofoliul sau când clientul îți spune că dorește altceva.",
      "Lucrezi cu cereri de cumpărare, închiriere și investiție. Legi cererea de contact și consulți lead-urile asociate, ca să păstrezi împreună persoana, nevoia și discuția comercială. Potrivirile folosesc criteriile cererii pentru a compara proprietățile disponibile în aplicație. Tu verifici rezultatele și decizi ce oferte sunt relevante pentru conversația cu acel client."
    ],
    "benefits": [
      {
        "title": "Criterii separate, nu doar o notă",
        "text": "Completezi bugetul, zonele, camerele, suprafața și tipul proprietății în câmpurile cererii. Informațiile nu rămân amestecate într-un text liber pe care trebuie să îl interpretezi la fiecare revenire. Poți verifica fiecare criteriu în parte și îl poți modifica atunci când clientul își clarifică sau schimbă preferințele."
      },
      {
        "title": "Tipul căutării, stabilit de la început",
        "text": "Alegi dacă urmărești cumpărare, închiriere sau investiție. Păstrezi acest context alături de criteriile proprietății, astfel încât să nu confunzi două căutări cu bugete sau zone asemănătoare. Tipul cererii face parte din evidență și te ajută să continui discuția pornind de la nevoia exprimată de client."
      },
      {
        "title": "Potriviri pentru cererea selectată",
        "text": "Deschizi potrivirile calculate pentru cerere și vezi proprietățile comparate cu criteriile ei. Scorul și motivele îți arată de ce o ofertă este relevantă sau unde apar diferențe. Nu tratezi rezultatul ca pe o decizie a clientului: îl folosești pentru a selecta proprietățile despre care merită să discuți."
      },
      {
        "title": "Legătura cu persoana și discuția",
        "text": "Cererea rămâne asociată contactului și lead-urilor relevante. Din aceste legături poți trece de la criterii la persoana care le-a formulat și la etapa discuției comerciale. Separi astfel ceea ce caută clientul de evoluția negocierii, fără să pierzi legătura dintre cele două informații din aplicație."
      },
      {
        "title": "O listă pe care o poți restrânge",
        "text": "Filtrezi cererile după tip, stare, prioritate, agent sau oraș. Alegi selecția de care ai nevoie înainte să deschizi o cerere și să verifici criteriile ei. Când lucrezi cu mai mulți clienți, lista îți permite să revii la cererile relevante fără să parcurgi fiecare fișă de contact."
      }
    ],
    "steps": [
      {
        "title": "Pornești de la discuția cu clientul",
        "text": "Clarifici dacă cererea este pentru cumpărare, închiriere sau investiție și o legi de contact. Păstrezi cererea ca o evidență a nevoii exprimate, nu ca o ofertă. Clientul și criteriile lui rămân conectate chiar dacă discuți ulterior despre mai multe proprietăți."
      },
      {
        "title": "Completezi criteriile de căutare",
        "text": "Introduci bugetul, zonele, camerele, suprafața și tipul proprietății. Verifici ce este important pentru client și păstrezi informațiile în câmpurile cererii. Pentru contextul conversației poți folosi notele contactului, fără să înlocuiești cu ele criteriile necesare comparării ofertelor."
      },
      {
        "title": "Verifici proprietățile potrivite",
        "text": "Consulți potrivirile pentru cererea ta și citești motivele asociate scorului. Compari datele ofertelor cu limitele și preferințele clientului. Alegi ce discuți mai departe pe baza informațiilor reale ale proprietăților, fără să presupui că un scor confirmă acceptarea unei oferte."
      },
      {
        "title": "Actualizezi cererea când nevoia se schimbă",
        "text": "Modifici criteriile atunci când clientul schimbă bugetul, zona sau caracteristicile căutate. Potrivirile se calculează din datele actualizate, iar cererea își păstrează legătura cu contactul. Revii și la lead-urile asociate pentru a urmări etapa discuției despre ofertele selectate."
      }
    ],
    "faq": [
      {
        "q": "Ce tipuri de cereri pot înregistra?",
        "a": "Poți înregistra cumpărare, închiriere și investiție. Alegi tipul cererii și completezi criteriile proprietății, precum bugetul, zonele, camerele și suprafața. Păstrezi astfel atât scopul căutării, cât și caracteristicile pe care vrei să le verifici în portofoliu."
      },
      {
        "q": "De ce să nu păstrez criteriile doar în note?",
        "a": "Câmpurile cererii sunt folosite pentru compararea cu proprietățile. O notă păstrează contextul discuției, dar nu înlocuiește bugetul sau zonele completate separat. Când criteriile sunt structurate, verifici mai ușor ce ai înregistrat și ce trebuie actualizat după o nouă conversație."
      },
      {
        "q": "Pot vedea de ce o proprietate se potrivește?",
        "a": "Da. Rezultatele au scor și motive explicate, astfel încât să vezi criteriile îndeplinite și diferențele. Le folosești pentru a pregăti discuția cu clientul. Potrivirea nu confirmă o tranzacție și nu înlocuiește verificarea informațiilor ofertei sau preferința exprimată de persoană."
      },
      {
        "q": "Cererea rămâne legată de client?",
        "a": "Da. Cererea are legătură cu contactul și cu lead-urile asociate. Poți reveni la persoană pentru istoricul relației sau la lead pentru evoluția discuției. Criteriile rămân în cerere, astfel încât nu trebuie să le rescrii în fiecare loc."
      }
    ],
    "related": [
      "contacte",
      "proprietati",
      "lead-uri",
      "potriviri-automate"
    ]
  },
  {
    "slug": "lead-uri",
    "name": "Lead-uri",
    "category": "Clienți și vânzări",
    "title": "Pipeline vânzări imobiliare | Habitoo CRM",
    "description": "Pipeline vânzări imobiliare cu nouă etape, coloane și listă: urmărești lead-urile, istoricul și agentul responsabil, inclusiv cererile venite de pe portaluri.",
    "h1": "Pipeline-ul de vânzări al agenției, de la primul contact la tranzacție",
    "intro": [
      "Un pipeline vânzări imobiliare îți arată unde ai ajuns cu fiecare discuție, nu doar câte contacte ai în listă. În Habitoo, urmărești lead-ul din momentul în care apare până când discuția se încheie. Folosești etapa pentru situația curentă și istoricul pentru schimbările, notele și activitățile pe care le-ai păstrat pe parcurs.",
      "Ai nouă etape: Nou, Contactat, Calificat, Vizionare, Ofertă, Negociere, Tranzacție, Câștigat și Pierdut. Lucrezi pe coloane sau într-o listă cu filtre și verifici agentul atribuit fiecărui lead. Legăturile cu persoana, cererea și proprietatea îți permit să revii la datele discuției înainte să faci următorul pas, fără să confunzi etapa cu detaliile căutării."
    ],
    "benefits": [
      {
        "title": "Etape pentru întreaga discuție comercială",
        "text": "Muți lead-ul prin Nou, Contactat, Calificat, Vizionare, Ofertă, Negociere și Tranzacție, după evoluția reală a discuției. La final folosești Câștigat sau Pierdut. Nu trebuie să păstrezi situația doar într-o notă: etapa rămâne vizibilă în evidență, iar istoricul îți arată schimbările pe care le-ai făcut."
      },
      {
        "title": "Coloane și listă pentru moduri diferite de lucru",
        "text": "Pe calculator tragi cardul în coloana etapei potrivite. Poți folosi și lista, cu filtre pentru etapă, agent, sursă sau căutare. Pe telefon schimbi etapa prin selecție. Alegi vederea potrivită momentului: coloanele pentru distribuția discuțiilor, lista când vrei să restrângi selecția și să găsești un anumit lead."
      },
      {
        "title": "Istoric și agent atribuit",
        "text": "Verifici istoricul complet al lead-ului, cu schimbările, notele și activitățile înregistrate. Vezi agentul atribuit și urmărești discuția în contextul responsabilității lui. Când revii la un lead, consulți ce s-a întâmplat înainte, în loc să deduci întreaga evoluție numai din numele coloanei în care se află acum."
      },
      {
        "title": "Legături cu datele pe care le folosești",
        "text": "Din lead ajungi la contact, cerere și proprietate, atunci când sunt asociate. Contactul îți arată persoana, cererea descrie criteriile, iar proprietatea păstrează oferta. Folosești aceste legături pentru a pregăti o discuție, o ofertă sau o vizionare fără să rescrii în lead toate informațiile deja existente în celelalte fișe."
      },
      {
        "title": "Cereri de pe portaluri, aduse în evidență",
        "text": "Cererile primite prin integrările compatibile pot intra automat ca lead-uri. Habitoo preia cereri de pe Storia/OLX, Housera, VDI și Properstar, în condițiile conexiunii agenției. Verifici detaliile fiecărui portal pe pagina Integrări, apoi urmărești cererea în aceeași evidență în care lucrezi și cu celelalte discuții comerciale."
      }
    ],
    "steps": [
      {
        "title": "Deschizi lead-ul și verifici contextul",
        "text": "Consulți sursa, agentul atribuit și legăturile disponibile. Verifici cine este clientul și despre ce discută cu agenția. Pentru lead-urile venite de pe portaluri, citești informațiile preluate înainte să continui conversația, fără să presupui că cererea este deja calificată."
      },
      {
        "title": "Alegi etapa potrivită",
        "text": "Muți cardul sau selectezi etapa care corespunde situației reale. Folosești Contactat după contact, Vizionare pentru discuțiile ajunse la această etapă și celelalte stări în funcție de evoluție. Nu schimbi etapa pentru a înlocui o notă despre ceea ce ai aflat."
      },
      {
        "title": "Păstrezi activitățile și observațiile",
        "text": "Înregistrezi activitățile și notele relevante pentru lead. Revii la istoric înainte de următoarea discuție și verifici datele din cerere sau proprietate. Etapa îți arată unde ai ajuns, iar informațiile înregistrate îți păstrează contextul pentru continuarea relației cu clientul."
      },
      {
        "title": "Urmărești rezultatul discuției",
        "text": "Filtrezi coloanele sau lista pentru lead-urile care te interesează și actualizezi starea când discuția avansează. La încheiere alegi Câștigat sau Pierdut, conform rezultatului real. Păstrezi istoricul în fișă pentru a putea verifica ulterior parcursul, nu doar rezultatul final."
      }
    ],
    "faq": [
      {
        "q": "Care sunt etapele disponibile?",
        "a": "Ai Nou, Contactat, Calificat, Vizionare, Ofertă, Negociere, Tranzacție, Câștigat și Pierdut. Alegi etapa după evoluția discuției cu clientul. Istoricul păstrează schimbările înregistrate, astfel încât poți verifica parcursul unui lead chiar după ce ai mutat cardul în altă coloană."
      },
      {
        "q": "Pot lucra fără să trag cardurile?",
        "a": "Da. Ai și vedere de listă cu filtre, iar etapa poate fi selectată. Pe telefon folosești selecția etapei. Coloanele și lista reprezintă aceeași evidență, astfel încât alegi modul de lucru potrivit fără să creezi un alt lead pentru aceeași discuție."
      },
      {
        "q": "De pe ce portaluri pot intra lead-uri?",
        "a": "Integrările care preiau cereri includ Storia/OLX, Housera, VDI și Properstar. Funcționarea depinde de conexiunea agenției și de drepturile necesare pe portal. Pagina Integrări îți arată detaliile fiecăruia; nu presupui că orice portal din listă transmite automat cereri către Habitoo."
      },
      {
        "q": "Ce verific înainte să continui un lead?",
        "a": "Verifici agentul, etapa, istoricul și legăturile cu contactul, cererea și proprietatea. Citești notele și activitățile existente pentru a înțelege contextul. Folosești aceste date pentru următoarea discuție, fără să interpretezi simpla prezență a lead-ului ca pe o tranzacție confirmată."
      }
    ],
    "related": [
      "contacte",
      "cereri",
      "potriviri-automate",
      "integrari"
    ]
  },
  {
    "slug": "potriviri-automate",
    "name": "Potriviri automate",
    "category": "Clienți și vânzări",
    "title": "Matching proprietăți clienți | Habitoo CRM",
    "description": "Matching proprietăți clienți în ambele sensuri: compari cereri și oferte după criterii, cu scor și motive explicate, recalculate din informațiile actualizate.",
    "h1": "Potriviri automate între cereri și proprietăți",
    "intro": [
      "Cu matching proprietăți clienți, pornești de la informațiile pe care le-ai păstrat deja în aplicație. În Habitoo, verifici proprietățile potrivite pentru o cerere sau clienții care caută o proprietate. Nu începi fiecare selecție de la o listă goală: compari criteriile cererii cu datele ofertelor și citești rezultatele înainte să alegi despre ce discuți.",
      "Fiecare potrivire vine cu un scor și motive explicate. Verifici tranzacția, bugetul, orașul și zona, camerele, suprafața, tipul proprietății și facilitățile cerute. Rezultatul descrie apropierea dintre datele din aplicație, nu intenția confirmată a clientului și nici rezultatul unei negocieri. Tu păstrezi decizia despre ofertele prezentate și verifici informațiile înaintea discuției."
    ],
    "benefits": [
      {
        "title": "De la o cerere la proprietăți",
        "text": "Selectezi cererea și vezi ofertele comparate cu criteriile clientului. Folosești bugetul, localizarea și caracteristicile pe care le-ai completat pentru a înțelege selecția. Citești scorul și motivele înainte să deschizi oferta, apoi verifici fișa proprietății pentru detaliile de care ai nevoie în conversație sau la pregătirea unei vizionări."
      },
      {
        "title": "De la o proprietate la clienți",
        "text": "Pornești și în sens invers, dintr-o proprietate către clienții care au criterii apropiate. Când lucrezi cu o ofertă, poți verifica cine caută ceva asemănător fără să recitești fiecare cerere separat. Rezultatele te ajută să pregătești discuțiile, dar nu înlocuiesc contactul cu persoana și confirmarea interesului pentru proprietatea respectivă."
      },
      {
        "title": "Criterii care folosesc datele existente",
        "text": "Compararea urmărește tranzacția, bugetul, orașul și zona, camerele, suprafața și tipul proprietății. Facilitățile sunt luate în considerare când sunt cerute. De aceea contează să completezi corect atât cererea, cât și oferta: rezultatul folosește informațiile existente, nu caracteristici presupuse despre client sau proprietate."
      },
      {
        "title": "Scor însoțit de explicații",
        "text": "Nu vezi doar un procent. Motivele îți arată criteriile îndeplinite și diferențele dintre cerere și proprietate. Poți observa de ce o ofertă este apropiată de căutare și ce merită clarificat cu clientul. Folosești explicațiile pentru a compara rezultatele, nu ca pe o promisiune că persoana va accepta proprietatea."
      },
      {
        "title": "Rezultate din informațiile actualizate",
        "text": "Când modifici o cerere sau o proprietate, potrivirile se recalculează din datele actualizate. Un buget schimbat ori o altă zonă influențează comparația, în loc să rămână ascunse într-o notă. Revii la rezultate după modificare și verifici din nou scorurile și motivele înainte să continui selecția pentru client."
      }
    ],
    "steps": [
      {
        "title": "Completezi datele pe care le compari",
        "text": "Verifici criteriile cererii și caracteristicile proprietăților. Păstrezi bugetul, localizarea, camerele și suprafața în câmpurile potrivite, iar facilitățile acolo unde sunt relevante. Notele pot explica discuția, dar nu înlocuiesc datele pe care le folosești pentru potrivire în aplicație."
      },
      {
        "title": "Alegi sensul căutării",
        "text": "Pornești de la cerere când vrei oferte pentru un client sau de la proprietate când cauți clienți pentru acea ofertă. Alegi în funcție de activitatea curentă, fără să schimbi criteriile doar pentru a obține mai multe rezultate. Cele două sensuri folosesc informațiile deja păstrate."
      },
      {
        "title": "Citești scorul împreună cu motivele",
        "text": "Compari rezultatele și verifici de ce se potrivesc. Deschizi datele ofertei sau ale cererii pentru detalii și clarifici diferențele înainte să propui o vizionare. Un scor apropiat nu îți spune singur dacă preferințele clientului sunt încă aceleași sau dacă acceptă oferta."
      },
      {
        "title": "Revii după schimbarea criteriilor",
        "text": "Actualizezi cererea când clientul își schimbă preferințele și proprietatea când primești informații noi. Consulți potrivirile recalculate și citești din nou explicațiile. Continui discuția pornind de la datele curente, fără să te bazezi doar pe o selecție făcută înaintea modificărilor."
      }
    ],
    "faq": [
      {
        "q": "Pot căuta atât proprietăți, cât și clienți?",
        "a": "Da. Ai sensurile Cerere → Proprietăți și Proprietate → Clienți. Alegi punctul de pornire în funcție de ceea ce lucrezi: o cerere pentru care cauți oferte sau o proprietate pentru care verifici clienții interesați de caracteristici asemănătoare."
      },
      {
        "q": "Ce criterii intră în potrivire?",
        "a": "Verifici tranzacția, bugetul, orașul și zona, camerele, suprafața, tipul proprietății și facilitățile cerute. Rezultatele folosesc datele completate în aplicație. Pentru o comparație relevantă, actualizezi câmpurile cererii și proprietății atunci când afli informații noi de la client sau proprietar."
      },
      {
        "q": "Scorul înseamnă că un client va cumpăra?",
        "a": "Nu. Scorul descrie potrivirea dintre criterii și datele ofertei. Motivele îți arată ce corespunde și ce diferă. Tu verifici interesul clientului, discuți despre proprietate și urmărești evoluția în lead, fără să tratezi scorul ca pe un rezultat confirmat."
      },
      {
        "q": "Ce se întâmplă după modificarea cererii?",
        "a": "Potrivirile se recalculează din informațiile actualizate. Când schimbi bugetul, zona sau alte criterii, revii la rezultate pentru noua comparație. Citești scorul și motivele înainte de a continua selecția, ca să nu lucrezi doar cu preferințele exprimate anterior."
      }
    ],
    "related": [
      "cereri",
      "proprietati",
      "contacte",
      "lead-uri"
    ]
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
const SECTION_PAGE_SLUGS: Record<string, string> = { matching: "potriviri-automate" };

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
