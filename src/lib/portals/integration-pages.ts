/**
 * Paginile publice /integrari/<slug>: o pagină per integrare disponibilă din registru.
 * Textele sunt scrise pentru agenți, fără termeni tehnici, și descriu doar ce face codul.
 */
import { isPortalCovered, PORTAL_GROUPS, PORTALS, PROMOTION_CATALOGS, portalIntegrationOwner, type PortalDefinition } from "./registry";
import { isKeyRequestPortal } from "./imospot-key-request";

export const INTEGRATION_PAGES_LASTMOD = "2026-10-29";

/** Portaluri unde Habitoo preia efectiv mesajele ca lead-uri (webhook/parser în cod). */
const LEAD_PORTALS = new Set(["storia", "vdi", "properstar"]);

type Content = {
  slug: string;
  /** Numele folosit în titlu și H1. */
  name: string;
  description: string;
  intro: string[];
  activation?: string;
  notes: string[];
  faq: { q: string; a: string }[];
};

const CONTENT: Record<string, Content> = {
  imo24: {
    slug: "imo24",
    name: "imo24.ro",
    description: "Publici, actualizezi și retragi anunțurile pe imo24.ro din Habitoo CRM, cu poze și agent responsabil trimise automat, fără credite sau promovări.",
    intro: [
      "Prin integrarea imo24.ro, publici anunțurile agenției din Habitoo și trimiți modificările fără să introduci din nou oferta pe portal. Publicarea, actualizarea și retragerea rămân legate de proprietatea cu care lucrezi în CRM.",
      "Pozele proprietății și agentul responsabil se trimit automat împreună cu anunțul. Astfel, pentru oferta publicată pe imo24.ro se folosește agentul care se ocupă de proprietate în Habitoo, fără să completezi separat aceste informații la fiecare trimitere.",
      "Dacă aceeași proprietate este oferită atât la vânzare, cât și la închiriere, pe imo24.ro se trimit două anunțuri: unul pentru fiecare tranzacție. Integrarea nu folosește creditele și nici promovările imo24 din Habitoo.",
    ],
    activation: "Administratorul agenției cere activarea din Setări → Portaluri, iar echipa Habitoo o aprobă. Agenția generează cheia în panoul imo24.ro, cu drept de scriere, iar echipa Habitoo o introduce pentru conectare.",
    notes: [
      "Cheia trebuie generată în panoul imo24.ro cu drept de scriere, pentru a putea trimite anunțurile.",
      "Pozele și agentul responsabil se trimit automat la publicarea ofertei.",
      "Creditele și promovările imo24 nu se folosesc din Habitoo.",
    ],
    faq: [
      { q: "Cine introduce cheia imo24.ro?", a: "Agenția o generează în panoul imo24.ro, cu drept de scriere, iar echipa Habitoo o introduce. Activarea este cerută de administratorul agenției din Setări → Portaluri și aprobată de echipa Habitoo." },
      { q: "Cum apare o proprietate oferită și la vânzare, și la închiriere?", a: "Se trimit două anunțuri pe imo24.ro, unul pentru vânzare și unul pentru închiriere. Pozele și agentul responsabil sunt trimise automat împreună cu oferta." },
      { q: "Pot folosi creditele sau promovările imo24 din Habitoo?", a: "Nu. Integrarea acoperă publicarea, actualizarea și retragerea anunțurilor, dar nu folosește creditele și promovările imo24 din Habitoo." },
    ],
  },
  zonata: {
    slug: "zonata",
    name: "ZonaTa.ro",
    description: "Publici anunțurile pe ZonaTa.ro din Habitoo CRM, cu până la 10 poze, vezi rezultatul verificării și poți retrage sau republica oferta din același loc.",
    intro: [
      "Integrarea ZonaTa.ro îți permite să trimiți anunțurile din Habitoo și să urmărești rezultatul în fișa proprietății. Pentru publicarea reală, agenția are nevoie de pachetul Enterprise ZonaTa cu acces pentru conectarea programelor, plătit de agenție direct la ZonaTa.",
      "Anunțul trimis trece prin verificarea automată ZonaTa. În Habitoo vezi dacă este În verificare, Publicat sau Respins, iar în cazul respingerii vezi și motivul. La fiecare anunț se trimit cel mult 10 poze.",
      "Retragerea lasă anunțul inactiv în contul ZonaTa al agenției și permite republicarea lui. Dacă proprietatea este oferită și la vânzare, și la închiriere, se trimit două anunțuri separate, câte unul pentru fiecare tranzacție.",
    ],
    activation: "Administratorul agenției cere activarea din Setări → Portaluri, iar echipa Habitoo o aprobă. Agenția creează cheia în contul ZonaTa, din Contul meu, în secțiunea cheilor de conectare, iar echipa Habitoo o introduce.",
    notes: [
      "Publicarea reală cere pachetul Enterprise cu acces pentru conectare, plătit de agenție la ZonaTa.",
      "ZonaTa verifică automat anunțul; rezultatul și motivul unei respingeri se văd în Habitoo.",
      "Se trimit maximum 10 poze; o proprietate oferită la vânzare și închiriere devine două anunțuri.",
    ],
    faq: [
      { q: "De unde iau cheia ZonaTa?", a: "Agenția creează cheia în contul ZonaTa, din Contul meu, în secțiunea cheilor de conectare. Echipa Habitoo o introduce după cererea de activare făcută de administrator din Setări → Portaluri." },
      { q: "De ce anunțul apare În verificare sau Respins?", a: "ZonaTa verifică automat anunțul înainte de publicare. Habitoo afișează rezultatul primit: În verificare, Publicat sau Respins. Dacă anunțul este respins, vezi și motivul transmis de ZonaTa." },
      { q: "Pot republica un anunț retras?", a: "Da. Retragerea îl lasă inactiv în contul ZonaTa, fără să-l elimine definitiv. Îl poți republica; pentru publicarea reală agenția trebuie să aibă pachetul Enterprise cu acces pentru conectare." },
    ],
  },
  homedirect: {
    slug: "homedirect",
    name: "HomeDirect.ro",
    description: "Publici pe HomeDirect.ro din Habitoo CRM fără o cheie de introdus; conturile se creează la primul anunț, iar retragerea ofertei rămâne reversibilă.",
    intro: [
      "HomeDirect.ro se conectează cu Habitoo fără ca agenția să introducă o cheie. Administratorul cere activarea din Setări → Portaluri, iar echipa Habitoo o aprobă, astfel încât agenții să poată folosi integrarea pentru ofertele lor.",
      "La primul anunț, HomeDirect creează automat contul agenției și contul agentului și trimite email de activare. Dacă agenția are deja un cont HomeDirect creat pe același email, legarea acestuia la Habitoo nu se poate face automat.",
      "Retragerea unui anunț este reversibilă. Când proprietatea este marcată Vândut sau Închiriat în Habitoo, anunțul primește marcajul corespunzător pe HomeDirect. Prețurile introduse în lei se trimit în euro, folosind cursul BNR al zilei.",
    ],
    activation: "Administratorul agenției cere activarea din Setări → Portaluri, iar echipa Habitoo o aprobă. Agenția nu introduce nicio cheie. HomeDirect creează conturile agenției și agentului la primul anunț și trimite emailurile de activare.",
    notes: [
      "Contul agenției și cel al agentului se creează la primul anunț, cu email de activare trimis de HomeDirect.",
      "Un cont HomeDirect existent pe același email al agenției nu se poate lega automat la Habitoo.",
      "Retragerea este reversibilă; prețurile în lei sunt trimise în euro la cursul BNR al zilei.",
    ],
    faq: [
      { q: "Trebuie să introduc o cheie HomeDirect?", a: "Nu. Agenția nu introduce nicio cheie. Administratorul solicită activarea din Setări → Portaluri, echipa Habitoo aprobă, iar HomeDirect creează conturile agenției și agentului la primul anunț." },
      { q: "Ce se întâmplă dacă agenția are deja cont HomeDirect?", a: "Dacă acel cont folosește același email al agenției, legarea lui la Habitoo nu se poate face automat. Crearea automată a contului la primul anunț nu înlocuiește această legare." },
      { q: "Cum sunt trimise prețurile în lei?", a: "Prețul în lei este convertit și trimis în euro, la cursul BNR al zilei. Când marchezi proprietatea Vândut sau Închiriat, anunțul HomeDirect este marcat corespunzător; retragerea obișnuită rămâne reversibilă." },
    ],
  },
  imopedia: {
    slug: "imopedia",
    name: "Imopedia.ro",
    description: "Publici, actualizezi și retragi anunțurile pe Imopedia.ro din Habitoo CRM, cu poze încărcate automat și opțiunea Gold prin bifa Promovat a ofertei.",
    intro: [
      "Integrarea Imopedia.ro îți permite să publici anunțurile din Habitoo, să trimiți actualizările și să retragi ofertele de pe portal. Lucrezi cu proprietatea din CRM, iar aceste acțiuni se fac din același loc, fără să rescrii anunțul separat.",
      "Pozele proprietății se încarcă automat pe Imopedia odată cu trimiterea anunțului. Când actualizezi oferta, folosești integrarea pentru a trimite modificările, iar când nu mai vrei anunțul pe portal îl poți retrage din Habitoo.",
      "Dacă bifezi Promovat pentru ofertă, Habitoo trimite anunțul ca Gold pe Imopedia. Datele de acces pentru conectare sunt emise de Imopedia, iar echipa Habitoo le introduce după aprobarea cererii de activare a agenției.",
    ],
    activation: "Administratorul agenției cere activarea din Setări → Portaluri, iar echipa Habitoo o aprobă. Imopedia emite utilizatorul, parola și ID-ul agenției; le soliciți la support@imopedia.ro, iar echipa Habitoo le introduce pentru conectare.",
    notes: [
      "Utilizatorul, parola și ID-ul agenției sunt emise de Imopedia și introduse de echipa Habitoo.",
      "Integrarea acoperă publicarea, actualizarea și retragerea; pozele se încarcă automat pe portal.",
      "Bifa Promovat trimite anunțul ca Gold pe Imopedia.",
    ],
    faq: [
      { q: "De unde primesc datele de acces Imopedia?", a: "Imopedia le emite pentru agenție: utilizator, parolă și ID agenție. Le soliciți la support@imopedia.ro, iar echipa Habitoo le introduce după aprobarea activării cerute din Setări → Portaluri." },
      { q: "Pozele se încarcă separat pe Imopedia?", a: "Nu trebuie să le încarci separat pentru anunțul trimis prin integrare. Habitoo încarcă automat pozele proprietății pe Imopedia, împreună cu publicarea ofertei din CRM." },
      { q: "Cum trimit un anunț ca Gold?", a: "Bifezi Promovat pentru ofertă în Habitoo. La trimitere, anunțul este trimis ca Gold pe Imopedia. Publicarea, actualizarea și retragerea rămân disponibile din fișa proprietății." },
    ],
  },
  storia: {
    slug: "storia",
    name: "Storia.ro + OLX.ro",
    description: "Publici anunțurile pe Storia.ro și OLX.ro din Habitoo CRM: conectezi contul agenției, alegi prelungirea automată și retragi oferta dintr-un click.",
    intro: [
      "Storia.ro și OLX.ro sunt printre cele mai vizitate locuri unde românii caută locuințe. Prin integrarea cu Habitoo, anunțul pe care îl introduci o singură dată în CRM ajunge pe Storia, iar de acolo apare și pe OLX.ro, fără o a doua publicare.",
      "Lucrezi în fișa proprietății din Habitoo: bifezi portalul și apeși Publică. Anunțul trece prin verificarea Storia, iar starea reală — în validare, publicat sau respins de moderare — se vede în Habitoo. Se publică doar categoriile rezidențiale și comerciale acceptate de Storia, iar mesajele primite de la clienți pe portal intră în CRM ca lead-uri, la agentul care se ocupă de proprietate.",
      "Pentru fiecare anunț alegi dacă se prelungește automat la expirare, cu bifa „Prelungire automată”; dacă nu alegi, se folosește setarea agenției. Habitoo doar transmite opțiunea către Storia: nu aplică promovări și nu cumpără nimic. Când marchezi proprietatea Vândut, Închiriat sau Arhivat, anunțul se retrage automat.",
    ],
    activation: "Administratorul agenției intră în Setări → Portaluri, apasă „Conectează contul Storia” și se autentifică în contul agenției de pe Storia.ro. După aprobare, conexiunea rămâne activă și se reînnoiește singură.",
    notes: [
      "Anunțul trece prin verificarea Storia înainte să apară public; statusul îl vezi în Habitoo.",
      "Bifa „Prelungire automată” se alege pe fiecare anunț; implicit se folosește setarea agenției.",
      "Promovările plătite se fac din contul tău de pe portal, nu din Habitoo.",
    ],
    faq: [
      { q: "Anunțul apare și pe OLX.ro?", a: "Da. Ce publici pe Storia prin Habitoo apare automat și pe OLX.ro, fără o a doua publicare." },
      { q: "Cum funcționează prelungirea automată?", a: "Pentru fiecare anunț bifezi dacă Storia îl prelungește automat la expirare; dacă nu alegi, se folosește setarea agenției. Habitoo transmite opțiunea, dar nu cumpără promovări." },
      { q: "Ce se întâmplă când vând proprietatea?", a: "Când marchezi proprietatea Vândut, Închiriat sau Arhivat, anunțul este retras automat de pe portal." },
    ],
  },
  olx_direct: {
    slug: "olx",
    name: "OLX.ro",
    description: "Publici anunțurile pe OLX.ro din pachetul agenției, direct din Habitoo CRM: conectezi contul OLX, actualizezi anunțul și îl retragi dintr-un click.",
    intro: [
      "Integrarea OLX.ro este pentru agențiile care publică din propriul pachet OLX, cu contul OLX al agenției. Habitoo trimite anunțul în contul tău, iar costul îl acoperă pachetul pe care îl ai deja.",
      "Anunțul îl scrii o singură dată în fișa proprietății. Când modifici prețul, descrierea sau pozele, apeși Publică și OLX primește varianta nouă. Anunțul apare ca publicat în Habitoo abia după ce OLX confirmă că este activ.",
      "Dacă folosești deja integrarea Storia.ro + OLX.ro, nu ai nevoie și de aceasta; o poți folosi însă alături de ea, dacă ai un pachet OLX separat.",
    ],
    activation: "Administratorul agenției intră în Setări → Portaluri, apasă butonul de conectare la OLX.ro și se autentifică în contul OLX al agenției. Conexiunea se reînnoiește singură.",
    notes: [
      "Habitoo nu cumpără pachete și nici promovări OLX; asta rămâne decizia agenției, din contul OLX.",
      "Dacă pachetul nu mai are anunțuri disponibile, vezi mesajul „Necesită pachet OLX” și anunțul așteaptă.",
      "Republicarea folosește același anunț OLX, nu creează unul nou.",
    ],
    faq: [
      { q: "Pot crea dubluri pe OLX?", a: "Nu. Înainte de fiecare publicare, Habitoo verifică dacă anunțul există deja în contul tău și îl refolosește." },
      { q: "Ce înseamnă „Necesită pachet OLX”?", a: "Anunțul a ajuns la OLX, dar pentru afișare ai nevoie de un pachet cu locuri libere în contul agenției." },
      { q: "Cum retrag un anunț?", a: "Debifezi OLX.ro în fișa proprietății sau marchezi proprietatea Vândut, Închiriat ori Arhivat." },
    ],
  },
  imobiliare_ro: {
    slug: "imobiliare-ro",
    name: "Imobiliare.ro",
    description: "Publici anunțurile pe Imobiliare.ro direct din Habitoo CRM: agenții se sincronizează automat, modificările ajung pe portal și retragi dintr-un click.",
    intro: [
      "Imobiliare.ro este unul dintre cele mai cunoscute portaluri imobiliare din România. Prin Habitoo îți publici anunțurile acolo direct din fișa proprietății, fără să le introduci a doua oară în contul de pe portal.",
      "Conectezi contul agenției o singură dată. De atunci, apeși Publică în Habitoo, iar anunțul ajunge online pe Imobiliare.ro, cu poze, cu watermark-ul agenției dacă l-ai activat. Agenții echipei se sincronizează automat la prima publicare.",
      "Când modifici proprietatea, trimiți varianta nouă tot cu Publică, iar dacă renunți la anunț îl retragi dintr-un click.",
    ],
    activation: "Administratorul agenției solicită activarea din Setări → Portaluri, iar echipa Habitoo o aprobă. Apoi conectezi contul agenției de pe Imobiliare.ro cu utilizatorul și parola lui; parola se folosește doar o dată, la conectare.",
    notes: [
      "Locația anunțului trebuie aleasă până la nivel de zonă, din lista portalului.",
      "Retragerea trece anunțul în ciornă pe portal, deci îl poți republica oricând.",
      "Promovările plătite și open house-ul se gestionează din contul de pe portal.",
    ],
    faq: [
      { q: "Trebuie să-mi dau parola de fiecare dată?", a: "Nu. Parola se folosește o singură dată, la conectare; conexiunea se reînnoiește apoi singură." },
      { q: "Agenții mei apar pe Imobiliare.ro?", a: "Da. Agentul responsabil este sincronizat automat cu contul agenției la prima publicare." },
      { q: "Ce se întâmplă la vânzare?", a: "Când marchezi proprietatea Vândut, Închiriat sau Arhivat, anunțul este retras automat." },
    ],
  },
  romimo: {
    slug: "publi24-romimo",
    name: "Publi24.ro + Romimo.ro",
    description: "Publici anunțurile pe Romimo.ro și Publi24.ro direct din Habitoo CRM, dintr-o singură conexiune: actualizezi anunțul și îl retragi dintr-un click.",
    intro: [
      "Romimo.ro și Publi24.ro aduc anunțurile tale în fața multor cumpărători și chiriași. Printr-o singură conexiune, anunțul publicat din Habitoo apare pe ambele site-uri.",
      "Lucrezi doar în fișa proprietății din Habitoo: bifezi portalul, apeși Publică, iar anunțul pleacă spre Romimo. Modificările de preț, text sau poze le trimiți la fel, cu Publică.",
      "Dacă renunți la anunț, îl retragi dintr-un click, de pe ambele site-uri deodată.",
    ],
    notes: [
      "Contul Romimo al agenției trebuie să aibă un pachet activ.",
      "Ai nevoie de cheia de acces primită de la Romimo și de emailul contului agenției.",
      "O singură publicare acoperă ambele site-uri; nu le configurezi separat.",
    ],
    faq: [
      { q: "Trebuie să public separat pe Publi24?", a: "Nu. Anunțul publicat pe Romimo prin Habitoo apare automat și pe Publi24.ro." },
      { q: "De unde iau cheia de acces?", a: "O primești de la Romimo pentru contul agenției. O introduci o dată, apoi se păstrează în siguranță." },
      { q: "Ce se întâmplă la vânzare?", a: "Când marchezi proprietatea Vândut, Închiriat sau Arhivat, anunțul este retras automat." },
    ],
  },
  imospot: {
    slug: "imospot",
    name: "Imospot.ro",
    description: "Publici anunțurile pe Imospot.ro direct din Habitoo CRM: soliciți cheia din Setări, actualizezi anunțurile și le retragi dintr-un click, fără dubluri.",
    intro: [
      "Imospot.ro este un portal imobiliar cu care Habitoo lucrează direct. Anunțul introdus în CRM ajunge pe Imospot când apeși Publică, fără să-l rescrii în alt cont.",
      "Habitoo verifică anunțul înainte să-l trimită, ca să nu fie respins: titlul, descrierea, prețul, telefonul de contact, locația și cel puțin o poză. Dacă lipsește ceva, vezi exact ce trebuie completat.",
      "Modificările le trimiți tot cu Publică, iar retragerea se face dintr-un click.",
    ],
    notes: [
      "Titlul are cel puțin 8 caractere, descrierea cel puțin 60, iar telefonul de contact este obligatoriu.",
      "Retragerea arhivează anunțul pe Imospot; la o nouă publicare revine online.",
      "O proprietate scoasă și la vânzare, și la închiriere devine două anunțuri separate.",
    ],
    faq: [
      { q: "Cât durează până primesc cheia?", a: "De obicei în aceeași zi lucrătoare. Imospot o trimite pe emailul administratorului agenției." },
      { q: "Pot crea dubluri?", a: "Nu. O nouă trimitere a aceleiași proprietăți actualizează anunțul existent." },
      { q: "Ce date ale firmei îmi trebuie?", a: "Datele agenției din Setări → Agenție trebuie completate înainte de a solicita cheia." },
    ],
  },
  vdi: {
    slug: "vdi",
    name: "VDI.ro",
    description: "Publici anunțurile pe VDI.ro direct din Habitoo CRM: agentul responsabil se trimite automat, iar mesajele clienților ajung ca lead-uri în CRM.",
    intro: [
      "VDI.ro este un portal imobiliar românesc cu care Habitoo lucrează direct. Anunțul pe care îl ai deja în CRM ajunge pe VDI.ro când apeși Publică.",
      "Înaintea anunțului, Habitoo trimite automat și agentul responsabil, ca pe portal să apară persoana potrivită pentru contact. Modificările le trimiți tot cu Publică, iar retragerea se face dintr-un click.",
      "Mesajele lăsate de clienți pe VDI.ro intră în Habitoo ca lead-uri, la agentul proprietății.",
    ],
    notes: [
      "Agentul responsabil trebuie să aibă un email în profil.",
      "Dotările nu se trimit deocamdată către VDI.ro.",
      "O ofertă scoasă și la vânzare, și la închiriere se publică pe VDI.ro ca vânzare.",
    ],
    faq: [
      { q: "Cine îmi dă cheia VDI.ro?", a: "VDI.ro o emite după cererea trimisă din Habitoo; echipa Habitoo o introduce și conexiunea devine activă." },
      { q: "Unde văd mesajele clienților?", a: "În Habitoo, ca lead-uri la agentul proprietății. Dacă anunțul nu e recunoscut, echipa Habitoo îl atribuie manual." },
      { q: "Ce se întâmplă la vânzare?", a: "Când marchezi proprietatea Vândut, Închiriat sau Arhivat, anunțul este retras automat." },
    ],
  },
  lacheie: {
    slug: "la-cheie",
    name: "La Cheie",
    description: "Publici anunțurile pe La Cheie direct din Habitoo CRM: activezi portalul singur din Setări, actualizezi anunțurile și le retragi dintr-un click.",
    intro: [
      "La Cheie este un portal imobiliar pe care îl poți activa singur, fără cereri și fără chei de introdus. Habitoo se ocupă de conexiune, folosind datele reale ale agenției tale.",
      "După activare, anunțurile se publică din fișa proprietății cu Publică. Când schimbi ceva, trimiți varianta completă din nou, iar portalul o înlocuiește pe cea veche. Retragerea se face dintr-un click.",
      "Dacă o trimitere nu reușește din cauza unei probleme temporare, Habitoo o reia singur.",
    ],
    notes: [
      "Se trimit cel mult 30 de poze per anunț.",
      "Mesajele clienților nu se preiau din La Cheie în Habitoo.",
      "Dacă portalul suspendă contul agenției, situația se rezolvă cu La Cheie, nu din CRM.",
    ],
    faq: [
      { q: "Am nevoie de o cheie de la La Cheie?", a: "Nu. Activezi portalul din Setări → Portaluri, iar Habitoo înregistrează agenția." },
      { q: "Ce date ale agenției se trimit?", a: "Numele, emailul, telefonul și adresa agenției, așa cum le ai în Habitoo." },
      { q: "Ce se întâmplă la vânzare?", a: "Când marchezi proprietatea Vândut, Închiriat sau Arhivat, anunțul este retras automat." },
    ],
  },
  primulanunt: {
    slug: "primulanunt",
    name: "PrimulAnunț.ro",
    description: "Publici anunțurile pe PrimulAnunț.ro direct din Habitoo CRM: pozele se încarcă automat, actualizezi anunțul și îl retragi dintr-un click, fără dubluri.",
    intro: [
      "PrimulAnunț.ro este un portal imobiliar cu care Habitoo lucrează direct. Anunțul pe care îl ai în CRM ajunge pe portal când apeși Publică, împreună cu pozele, încărcate automat.",
      "Prima poză devine coperta anunțului. Modificările le trimiți tot cu Publică și se actualizează același anunț, fără dubluri. Retragerea îl arhivează pe portal, nu îl șterge definitiv.",
      "După publicare, Habitoo păstrează linkul public al anunțului de pe PrimulAnunț.ro.",
    ],
    notes: [
      "Se trimit cel mult 20 de poze, de maximum 10 MB fiecare.",
      "Conturile de agenție neverificate trec prin moderare înainte ca anunțul să apară public.",
      "Promovarea plătită se face din contul de pe portal, nu din Habitoo.",
    ],
    faq: [
      { q: "De unde iau cheia?", a: "Din contul tău PrimulAnunț.ro, secțiunea „Integrare CRM”. O poți revoca oricând de acolo." },
      { q: "De ce nu apare anunțul imediat?", a: "Dacă contul agenției nu este încă verificat, portalul verifică anunțul înainte de afișare." },
      { q: "Ce se întâmplă la vânzare?", a: "Când marchezi proprietatea Vândut, Închiriat sau Arhivat, anunțul este retras automat." },
    ],
  },
  homepitch: {
    slug: "homepitch",
    name: "HomePitch.ro",
    description: "Trimiți anunțurile pe HomePitch.ro din Habitoo CRM: alegi ofertele, portalul le preia automat, iar cheia Habitoo acoperă toți agenții agenției.",
    intro: [
      "HomePitch.ro preia anunțurile direct din Habitoo. Tu alegi ce oferte apar pe HomePitch, iar portalul le citește singur, periodic, fără să le introduci a doua oară.",
      "Habitoo îți dă o cheie pe care o introduci o singură dată în contul HomePitch, în secțiunea de setări CRM. Cheia acoperă toți agenții agenției.",
      "Dacă vrei ca oferta să apară mai repede, poți activa importul instant: la bifarea ofertei, HomePitch este anunțat imediat.",
    ],
    activation: "Administratorul agenției solicită activarea din Setări → Portaluri, iar echipa Habitoo o aprobă. Apoi copiezi cheia afișată în Habitoo și o introduci în contul HomePitch, la setările CRM.",
    notes: [
      "Oferta are nevoie de locație pe hartă, agent cu email, titlu, descriere și preț în euro.",
      "Ofertele cu preț în altă monedă decât euro nu se trimit.",
      "O proprietate scoasă și la vânzare, și la închiriere apare o singură dată, ca vânzare.",
    ],
    faq: [
      { q: "Trebuie câte o cheie pentru fiecare agent?", a: "Nu. O singură cheie acoperă toți agenții agenției." },
      { q: "Cum scot o ofertă de pe HomePitch?", a: "O debifezi în Habitoo sau marchezi proprietatea Vândut, Închiriat ori Arhivat; dispare la următoarea preluare." },
      { q: "Importul instant e obligatoriu?", a: "Nu. Fără el, HomePitch preia ofertele la citirea periodică." },
    ],
  },
  imove: {
    slug: "imove",
    name: "iMove.ro",
    description: "Trimiți anunțurile pe iMove.ro din Habitoo CRM: alegi ofertele, iMove le preia automat, iar cele debifate dispar de pe portal la următoarea preluare.",
    intro: [
      "iMove.ro preia anunțurile agenției direct din Habitoo. Tu alegi ce oferte apar pe iMove, iar portalul le importă singur, la fiecare preluare periodică.",
      "Nu mai copiezi texte și poze. Când modifici o ofertă în Habitoo, varianta nouă ajunge pe iMove la următoarea preluare.",
      "Când nu mai vrei oferta pe portal, o debifezi, iar iMove o arhivează.",
    ],
    notes: [
      "Ofertele apar și se schimbă pe iMove la următoarea preluare, nu instantaneu.",
      "Cheia de acces o emite iMove pentru contul agenției, nu Habitoo.",
      "Publicarea se face doar prin preluarea ofertelor alese; nu există o trimitere separată.",
    ],
    faq: [
      { q: "De unde iau cheia?", a: "Din contul agenției pe iMove.ro. O introduci o dată în Habitoo și se păstrează în siguranță." },
      { q: "Cât de repede apare o ofertă?", a: "La următoarea preluare făcută de iMove." },
      { q: "Ce se întâmplă la vânzare?", a: "Oferta vândută, închiriată sau arhivată nu mai este trimisă, iar iMove o scoate la următoarea preluare." },
    ],
  },
  properstar: {
    slug: "properstar",
    name: "Properstar",
    description: "Arăți anunțurile agenției pe Properstar din Habitoo CRM: activezi singur portalul, alegi ofertele, iar mesajele clienților ajung ca lead-uri în CRM.",
    intro: [
      "Properstar este un portal imobiliar internațional, util când vrei ca proprietățile tale să fie văzute și de cumpărători din afara țării. Prin Habitoo, ofertele alese ajung pe Properstar fără să le introduci din nou.",
      "Activezi portalul singur. Apoi bifezi Properstar la ofertele pe care vrei să le arăți, iar portalul le preia periodic. Când debifezi o ofertă, Properstar este anunțat și oferta dispare.",
      "Mesajele trimise de clienți pe Properstar ajung în Habitoo ca lead-uri, la agentul potrivit.",
    ],
    notes: [
      "Fiecare ofertă bifată ocupă un loc de publicare din abonament.",
      "Ofertele apar și se schimbă la următoarea preluare făcută de Properstar.",
      "Nu ai nicio cheie de introdus; agenția intră automat după activare.",
    ],
    faq: [
      { q: "Am nevoie de un cont Properstar?", a: "Nu pentru conexiune. Activezi portalul din Habitoo, iar agenția intră automat." },
      { q: "Unde văd mesajele clienților?", a: "În Habitoo, ca lead-uri la agentul ofertei sau la agentul căruia i-a scris clientul." },
      { q: "Ce se întâmplă la vânzare?", a: "Oferta vândută, închiriată sau arhivată iese de pe Properstar la următoarea preluare." },
    ],
  },
  clickimob: {
    slug: "clickimob",
    name: "ClickImob",
    description: "Ofertele agenției ajung pe ClickImob din Habitoo CRM: activezi singur portalul, iar modificările apar pe portal în cel mult 15 minute, fără chei de introdus.",
    intro: [
      "ClickImob preia ofertele agenției direct din Habitoo. Agențiile noi îl au activ de la început, iar celelalte îl pot activa singure, dintr-un click.",
      "Bifezi ClickImob la ofertele pe care vrei să le arăți. Modificările de preț, text sau poze ajung pe portal în cel mult 15 minute, fără să faci nimic în plus.",
      "Când debifezi o ofertă sau o marchezi vândută, iese de pe ClickImob la următoarea preluare. Astfel, ce vede clientul pe portal rămâne mereu la fel cu ce ai în CRM, fără verificări manuale.",
    ],
    notes: [
      "Nu există chei sau parole de introdus; conexiunea se face prin Habitoo.",
      "Schimbările apar pe ClickImob în cel mult 15 minute, nu instantaneu.",
      "Fiecare ofertă bifată ocupă un loc de publicare din abonament.",
    ],
    faq: [
      { q: "Trebuie să cer activarea?", a: "Nu. Agențiile noi îl au activ, iar celelalte îl activează singure din Setări → Portaluri." },
      { q: "Cât durează până apare o modificare?", a: "Cel mult 15 minute." },
      { q: "Am nevoie de un cont ClickImob?", a: "Nu pentru conexiune; ofertele ajung pe portal prin Habitoo." },
    ],
  },
  facebook_catalog: {
    slug: "catalog-facebook",
    name: "Catalog Facebook",
    description: "Pui anunțurile agenției în catalogul din Meta Commerce Manager, direct din Habitoo CRM, ca să le folosești în reclamele tale pe Facebook și Instagram.",
    intro: [
      "Catalogul Facebook te ajută să-ți folosești anunțurile în reclamele de pe Facebook și Instagram. Habitoo pregătește lista anunțurilor alese de tine, iar Meta Commerce Manager o citește periodic.",
      "Tu alegi ce anunțuri intră în catalog. Prețul, pozele și descrierea vin din fișa proprietății, așa că nu le mai introduci separat la Meta.",
      "Reclamele le creezi și le plătești tu, din contul tău Meta; Habitoo nu publică postări și nu pornește campanii.",
    ],
    activation: "Administratorul agenției deschide Setări → Portaluri, cardul Catalog Facebook, și copiază linkul catalogului. Linkul se adaugă o singură dată în Meta Commerce Manager, ca sursă de date a catalogului.",
    notes: [
      "Un anunț dezactivat sau vândut iese din catalog la următoarea citire făcută de Meta.",
      "Agenții pot alege singuri anunțurile lor doar dacă administratorul permite asta.",
      "Habitoo nu creează reclame și nu publică pe pagina agenției.",
    ],
    faq: [
      { q: "Habitoo face reclamele în locul meu?", a: "Nu. Habitoo ține catalogul la zi; reclamele le creezi tu în contul Meta." },
      { q: "Cât de des se actualizează catalogul?", a: "La fiecare citire programată în Meta Commerce Manager." },
      { q: "Cine alege anunțurile?", a: "Administratorul agenției; agenții doar pentru anunțurile lor, dacă setarea agenției permite." },
    ],
  },
};

export type IntegrationPage = Content & {
  portalId: string;
  definition: PortalDefinition;
  canDo: string[];
  dailyWork: string[];
  whyHabitoo: string;
  activationText: string;
  related: { slug: string; name: string }[];
  title: string;
};

function canDo(def: PortalDefinition, name: string): string[] {
  const c = new Set(def.capabilities);
  const out: string[] = [];
  const direct = c.has("publish_listing") && !c.has("feed_pull");
  if (def.id === "facebook_catalog") {
    out.push("Alegi din Habitoo ce anunțuri intră în catalogul tău Meta.");
    out.push("Prețul, pozele și descrierea se iau din fișa proprietății.");
  } else if (direct) {
    out.push(`Publici anunțul pe ${name} direct din fișa proprietății, fără să-l introduci din nou.`);
  } else {
    out.push(`Alegi din Habitoo ce oferte apar pe ${name}; portalul le preia singur.`);
  }
  if (c.has("update_listing") || c.has("feed_pull")) {
    out.push(direct ? "Trimiți modificările de preț, text sau poze cu un singur click pe Publică." : "Modificările din Habitoo ajung pe portal automat, la următoarea preluare.");
  }
  if (c.has("withdraw_listing")) out.push(def.id === "homedirect" ? "Retragi anunțul reversibil; la Vândut sau Închiriat, HomeDirect îl marchează corespunzător." : "Retragi anunțul dintr-un click; la Vândut, Închiriat sau Arhivat se retrage automat.");
  else if (c.has("feed_pull")) out.push("Dacă debifezi oferta, aceasta iese de pe portal la următoarea preluare.");
  if (c.has("manage_media")) out.push("Pozele se încarcă automat odată cu anunțul.");
  if (c.has("fetch_agents") || def.id === "vdi") out.push("Agentul responsabil se sincronizează automat cu portalul.");
  if (LEAD_PORTALS.has(def.id)) out.push("Primești mesajele clienților ca lead-uri în CRM, la agentul potrivit.");
  return out;
}

function dailyWork(def: PortalDefinition, name: string): string[] {
  const c = new Set(def.capabilities);
  const start = "Introduci proprietatea o singură dată în Habitoo: datele, pozele, descrierea și agentul responsabil.";
  if (def.id === "facebook_catalog") {
    return [start, "Alegi apoi anunțurile care intră în catalog. Meta citește lista la intervalele stabilite în Commerce Manager și preia singură anunțurile noi, modificările și pe cele scoase. Tu te ocupi doar de reclame, în contul tău Meta, unde poți folosi anunțurile din catalog ca să ajungi la oameni care caută o locuință."];
  }
  if (c.has("publish_listing") && !c.has("feed_pull")) {
    return [
      start,
      `În fila Publicare a proprietății bifezi ${name}, alături de celelalte portaluri pe care vrei să apară anunțul, și apeși Publică. Trimiterea continuă și dacă închizi pagina. Rezultatul îl vezi pe cardul portalului, iar dacă ceva nu merge primești o notificare cu motivul exact. Când schimbi prețul sau pozele, apeși din nou Publică.`,
      ...(c.has("withdraw_listing") ? [def.id === "homedirect" ? "Când proprietatea se vinde sau se închiriază, schimbi statusul în Habitoo, iar HomeDirect marchează anunțul Vândut sau Închiriat." : "Când proprietatea se vinde sau se închiriază, schimbi doar statusul în Habitoo, iar anunțul se retrage singur."] : []),
    ];
  }
  return [
    start,
    `În fila Publicare a proprietății bifezi ${name}. Portalul citește periodic lista ofertelor alese de tine în Habitoo și preia singur ofertele noi, modificările și pe cele scoase. După o modificare nu trebuie să apeși nimic în plus: varianta nouă apare la următoarea preluare. Pe cardul portalului vezi dacă oferta este inclusă.`,
  ];
}

function whyHabitoo(name: string): string {
  return `Când lucrezi cu mai multe portaluri, cel mai mult timp se pierde cu aceleași date scrise de mai multe ori și cu anunțurile uitate online după vânzare. Cu ${name} legat de Habitoo, proprietatea, clientul și anunțul stau în același loc, iar echipa vede pe fiecare proprietate unde este publicată și ce s-a întâmplat cu ea.`;
}

const SHARED_FAQ = [
  { q: "Pot publica același anunț pe mai multe portaluri?", a: "Da. În fila Publicare bifezi toate portalurile active ale agenției și le trimiți deodată, din același loc." },
  { q: "Cine poate activa integrarea?", a: "Doar administratorul agenției, din Setări → Portaluri. Agenții folosesc apoi portalurile active pentru anunțurile lor." },
];

function activationText(def: PortalDefinition, custom?: string): string {
  if (custom) return custom;
  if (isKeyRequestPortal(def.id)) {
    return `Administratorul agenției solicită activarea din Setări → Portaluri. Habitoo trimite cererea, iar cheia o emite ${def.display_name} și ajunge pe emailul administratorului; echipa Habitoo finalizează apoi conexiunea.`;
  }
  if (def.activation === "self_service") return "Administratorul agenției activează portalul singur, dintr-un click, din Setări → Portaluri. Nu trebuie să aștepți aprobare.";
  if (def.activation === "oauth") return `Administratorul agenției intră în Setări → Portaluri și își conectează contul de pe ${def.display_name}.`;
  return `Administratorul agenției solicită activarea din Setări → Portaluri, iar echipa Habitoo o aprobă. Datele de acces le primești de la ${def.display_name} și le introduci o singură dată; se păstrează în siguranță.`;
}

const DEFINITIONS = [...PORTALS, ...PROMOTION_CATALOGS].filter((d) => d.status === "available" && CONTENT[d.id]);

const BASE = DEFINITIONS.map((d) => ({ d, c: CONTENT[d.id] }));

export const INTEGRATION_PAGES: IntegrationPage[] = BASE.map(({ d, c }, i) => ({
  ...c,
  portalId: d.id,
  definition: d,
  faq: [...c.faq.slice(0, 3), SHARED_FAQ[0]],
  canDo: canDo(d, c.name),
  dailyWork: dailyWork(d, c.name),
  activationText: `${activationText(d, c.activation)} ${SHARED_FAQ[1].a.replace("Doar administratorul agenției, din Setări → Portaluri. ", "")}`,
  whyHabitoo: whyHabitoo(c.name),
  related: [1, 2, 3].map((k) => BASE[(i + k) % BASE.length].c).map((r) => ({ slug: r.slug, name: r.name })),
  title: `Integrare ${c.name} cu CRM imobiliar | Habitoo`,
}));

export function integrationPageBySlug(slug: string): IntegrationPage | null {
  return INTEGRATION_PAGES.find((p) => p.slug === slug) ?? null;
}

/** Slug-ul paginii pentru un portal (inclusiv portaluri acoperite de un grup, ex. olx → storia). */
export function integrationSlugFor(portalId: string): string | null {
  return CONTENT[portalIntegrationOwner(portalId)]?.slug ?? CONTENT[portalId]?.slug ?? null;
}

export const RELATED_CTA_TEXT = "Creează agenția în câteva minute sau cere o demonstrație, ca să vezi integrarea pe anunțurile tale.";

/** Toate textele vizibile ale paginii (pentru numărarea cuvintelor). */
export function integrationPageText(p: IntegrationPage): string {
  return [
    `Integrare ${p.name} cu Habitoo CRM`,
    ...p.intro,
    p.whyHabitoo,
    "Ce poți face",
    ...p.canDo,
    "Cum lucrezi în fiecare zi",
    ...p.dailyWork,
    "Cum activezi",
    p.activationText,
    "Bine de știut",
    ...p.notes,
    "Întrebări frecvente",
    ...p.faq.flatMap((f) => [f.q, f.a]),
    RELATED_CTA_TEXT,
    "Alte integrări",
    ...p.related.map((r) => r.name),
    "Toate integrările Funcționalități",
  ].join(" ");
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/**
 * Portalurile prezentate pe homepage: doar cele cu pagină publică în /integrari,
 * în ordinea din registru. OLX direct și portalurile acoperite de un grup nu apar separat;
 * cataloagele de promovare (Facebook) nu intră în grilă.
 */
export function homepagePortals(): { portal: PortalDefinition; label: string }[] {
  const withPage = new Set(INTEGRATION_PAGES.map((p) => p.portalId));
  return PORTALS.filter(
    (portal) =>
      portal.status === "available" &&
      !isPortalCovered(portal.id) &&
      portal.id !== "olx_direct" &&
      withPage.has(portal.id),
  ).map((portal) => ({
    portal,
    label: PORTAL_GROUPS.find((g) => g.primary === portal.id)?.label ?? portal.display_name,
  }));
}
