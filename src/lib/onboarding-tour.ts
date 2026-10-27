import type { AppRole } from "@/hooks/use-session";
import type { AiFeatureKey, AiFeatureMap } from "@/lib/ai/features/keys";

export type TourStep = {
  id: string; title: string; text: string;
  selector?: string;
  mode?: "explain" | "do" | "show";
  event?: "click" | "input";
  hint?: string;
  confirmation?: string;
  show?: "menu" | "portfolio" | "clients" | "management" | "filters" | "publish" | "details";
  fallbackNote?: string;
  /** Pasul se sare singur dacă elementul nu există pentru utilizatorul curent. */
  optional?: boolean;
  /** Pasul apare doar pentru aceste roluri. */
  roles?: AppRole[];
  /** Pasul apare doar dacă funcția AI este activată pentru agenție. */
  feature?: AiFeatureKey;
};
export type GuideDefinition = {
  id: string; title: string; group: string;
  /** Calea paginii; segmentul `:id` se potrivește cu orice valoare. */
  path: string;
  roles: AppRole[]; feature?: AiFeatureKey;
  /** Ghid contextual: pornește la evenimentul anunțat, nu la simpla deschidere a paginii. */
  context?: string | string[];
  steps: TourStep[];
};
export const GUIDE_IDS = [
  "first-steps", "properties-list", "property-create",
  "properties-tools", "property-detail", "property-edit", "property-media",
  "property-publishing", "property-promotions", "property-video-social",
  "property-leads", "property-documents", "property-acp", "property-marketing",
  "collaboration",
] as const;
export type GuideId = (typeof GUIDE_IDS)[number];

const agencyRoles: AppRole[] = ["agent", "agency_admin", "superadmin"];
const adminRoles: AppRole[] = ["agency_admin", "superadmin"];
const PROPERTY = "/app/properties/:id";

export const implementedGuides: GuideDefinition[] = [
  { id: "first-steps", title: "Primii pași", group: "Dashboard", path: "/app", roles: ["agent", "agency_admin"], steps: [
    { id: "welcome", title: "Primii pași", text: "Bun venit! Descoperim pagina de start și principalele zone. Nu salvăm și nu trimitem nimic." },
    { id: "overview", title: "Privirea de ansamblu", text: "Aici vezi portofoliul și activitatea. Cifrele sunt cele la care ai acces.", selector: '[data-tour="dashboard-overview"]' },
    { id: "today", title: "Ce ai de făcut", text: "Mai jos găsești activitățile și lucrurile care cer atenție. Administratorul vede și situația echipei.", selector: '[data-tour="dashboard-work"]' },
    { id: "menu", title: "Deschide meniul", text: "Arată-mi unde sunt principalele zone.", mode: "show", show: "menu", selector: '[data-tour="main-navigation"]' },
    { id: "portfolio", title: "Portofoliul", text: "Apasă Portofoliu ca să vezi proprietățile și adăugarea unui anunț.", mode: "do", selector: '[data-tour="group:Portofoliu"]', event: "click", hint: "Apasă rândul Portofoliu din meniu.", confirmation: "Ai găsit portofoliul." },
    { id: "clients", title: "Clienții tăi", text: "Contacte, Cereri, Lead-uri și Contracte sunt grupate aici.", mode: "show", show: "clients", selector: '[data-tour="group:Clienți"]' },
    { id: "network", title: "Rețea și anunțuri", text: "Colaborare te leagă de parteneri. Anunțuri particulari te ajută să găsești oferte de la proprietari.", selector: '[data-tour="nav:/app/collaboration"]', fallbackNote: "Găsești aceste zone în meniu: Rețea și Anunțuri." },
    { id: "help", title: "Ghidul continuă cu tine", text: "Fiecare pagină va avea propriul ghid la prima deschidere. Primele disponibile sunt Proprietăți și Adaugă proprietate. Din Ghid le reiei și controlezi pornirea automată.", selector: '[data-tour="guide-menu"]' },
  ]},
  { id: "properties-list", title: "Proprietăți", group: "Portofoliu", path: "/app/properties", roles: agencyRoles, steps: [
    { id: "portfolio", title: "Proprietățile agenției", text: "Aici găsești anunțurile la care ai acces, cu status, preț și portaluri.", selector: '[data-tour="properties-results"]' },
    { id: "search", title: "Caută un anunț", text: "Scrie un cuvânt sau un cod HB în căutare. Poți schimba textul după ghid.", selector: '#property-keywords', mode: "do", event: "input", hint: "Scrie, de exemplu, apartament sau un cod HB.", confirmation: "Ai folosit căutarea." },
    { id: "filters", title: "Mai multe filtre", text: "Arată-mi filtrele pentru zonă, preț și caracteristici.", selector: '[data-tour="properties-filters-toggle"]', mode: "show", show: "filters" },
    { id: "paging", title: "Sortare și pagini", text: "Alegi ordinea și câte anunțuri vezi. Filtrele aplicate rămân până le ștergi.", selector: '[data-tour="properties-order"]' },
    { id: "publishing", title: "Vederea Publicare", text: "Arată-mi portalurile. Doar deschidem vederea; nu bifăm și nu publicăm nimic.", selector: '[data-tour="properties-view-publish"]', mode: "show", show: "publish" },
    { id: "bulk", title: "Acțiunile în masă", text: "Selecția se aplică paginii afișate. Publicarea, retragerea sau arhivarea cer acțiunea ta; ghidul nu le execută.", selector: '[data-tour="properties-results"]' },
    { id: "new", title: "Un anunț nou", text: "Apasă Adaugă proprietate când vrei să începi. Formularul are propriul ghid; nimic nu se salvează la deschidere.", selector: '[data-tour="property-add"]', mode: "do", event: "click", hint: "Butonul Adaugă proprietate este deasupra listei.", confirmation: "Ai deschis formularul." },
  ]},
  { id: "property-create", title: "Adaugă o proprietate", group: "Portofoliu", path: "/app/properties/new", roles: agencyRoles, steps: [
    { id: "welcome", title: "Adaugă o proprietate", text: "Completezi datele esențiale. Ghidul te lasă înainte de salvare; tu decizi dacă păstrezi anunțul." },
    { id: "title", title: "Titlul anunțului", text: "Scrie un titlu scurt: tip, camere și zonă. Folosește datele proprietății tale.", selector: '#title', mode: "do", event: "input", hint: "Scrie titlul în câmpul Titlu anunț.", confirmation: "Titlul este completat." },
    { id: "description", title: "Descrierea publică", text: "Textul de aici poate ajunge în anunțul public. Evită datele personale ale proprietarului.", selector: '#description' },
    { id: "general", title: "Status și proprietar", text: "Draft este alegerea inițială. Poți asocia un contact proprietar existent.", selector: '[data-tour="new-general"]' },
    { id: "location", title: "Localizarea", text: "Alegi județul și localitatea, apoi adresa și poziția pe hartă. Verifică precizia înainte de publicare.", selector: '[data-tour="new-location"]' },
    { id: "price", title: "Preț și tranzacție", text: "Completează prețul de vânzare. Dacă oferta este doar pentru chirie, sari pasul și alege închirierea.", selector: '#new-sale-price', mode: "do", event: "input", hint: "Introdu prețul fără separator de mii sau sari pasul dacă nu vinzi.", confirmation: "Prețul este completat." },
    { id: "details", title: "Detaliile proprietății", text: "Arată-mi câmpurile pentru tip, camere și etaj.", selector: '[data-tour="new-details"]', mode: "show", show: "details" },
    { id: "notes", title: "Note doar pentru agenție", text: "Notele interne nu se publică. Fotografiile se adaugă după crearea proprietății.", selector: '#internal_notes' },
    { id: "save", title: "Tu decizi când salvezi", text: "Salvează proprietatea ar crea anunțul cu datele și statusul ales și ar deschide detaliile. Nu publică automat pe portaluri. Ghidul se oprește aici, fără să apese butonul.", selector: '[data-tour="new-save"]' },
  ]},

  // ————— Etapa 2: Portofoliu și Colaborare —————
  { id: "properties-tools", title: "Proprietăți — unelte din listă", group: "Portofoliu", path: "/app/properties", roles: agencyRoles, context: "properties:tools", steps: [
    { id: "welcome", title: "Uneltele listei", text: "Ai schimbat vederea sau ai selectat un anunț, așa că trecem prin uneltele listei. Nu schimbăm și nu trimitem nimic." },
    { id: "views", title: "Listă, Carduri sau Publicare", text: "Alegi cum vezi anunțurile. Vederea Publicare arată situația pe fiecare portal, fără să publice ceva.", selector: '[data-tour="properties-views"]' },
    { id: "select", title: "Selectează un anunț", text: "Bifează un anunț din listă ca să vezi acțiunile în masă. Bifa singură nu schimbă nimic.", selector: 'input[aria-label^="Selectează"]', mode: "do", event: "click", hint: "Bifa este în stânga rândului sau pe card.", confirmation: "Ai selectat un anunț." },
    { id: "bulk", title: "Acțiunile în masă", text: "Cu o selecție activă poți schimba statusul, agentul sau portalurile pentru toate anunțurile bifate. Fiecare acțiune cere confirmarea ta.", selector: '[data-tour="properties-selection"]', optional: true, fallbackNote: "Bara de acțiuni apare deasupra listei când ai cel puțin un anunț bifat." },
    { id: "saved", title: "Vederi salvate", text: "Din Filtre salvate reiei o combinație de filtre, iar Salvează filtrul păstrează combinația curentă.", selector: '[data-tour="properties-saved-views"]', optional: true },
    { id: "export", title: "Export CSV", text: "Exportul descarcă exact anunțurile filtrate pe care le vezi, cu accesul tău.", selector: '[data-tour="properties-export"]' },
    { id: "import", title: "Import din anunțuri particulari", text: "Din Anunțuri particulari poți importa o ofertă în portofoliu. Importul creează un draft pe numele tău; nu publică nimic." },
  ]},
  { id: "property-detail", title: "Pagina proprietății", group: "Portofoliu", path: PROPERTY, roles: agencyRoles, steps: [
    { id: "welcome", title: "Pagina proprietății", text: "Aici găsești totul despre un anunț. Trecem prin zonele paginii; nu salvăm și nu publicăm nimic." },
    { id: "tabs", title: "Filele proprietății", text: "Fiecare filă are ghidul ei, care pornește singur prima dată când o deschizi.", selector: '[data-tour="property-tabs"]' },
    { id: "overview", title: "Prezentarea", text: "Datele principale, descrierea, harta și următorul pas programat.", selector: '[data-tour="property-overview"]' },
    { id: "actions", title: "Acțiunile rapide", text: "De aici editezi, programezi o vizionare, pornești o analiză de piață sau adaugi un comision.", selector: '[data-tour="property-actions"]' },
    { id: "more", title: "Mai multe acțiuni", text: "Meniul ascunde fișa PDF, Adaugă client, schimbarea statusului, arhivarea și ștergerea.", selector: '[data-tour="property-more"]' },
    { id: "pdf", title: "Fișa de proprietate (PDF)", text: "Din Mai multe → Generează fișa creezi un PDF pentru client sau pentru alt agent, fără datele private ale proprietarului." },
    { id: "status", title: "Status, arhivare, ștergere", text: "Vândută sau Închiriată retrag anunțul de pe portaluri. Arhivarea și ștergerea cer confirmarea ta și nu se refac automat — ghidul doar le explică." },
    { id: "reassign", title: "Schimbă agentul", text: "Ca administrator, din fila Agent poți reasigna proprietatea altui coleg. Portalurile active primesc noul contact.", selector: '[data-tour="property-tab-agent"]', roles: adminRoles },
  ]},
  { id: "property-edit", title: "Editează proprietatea", group: "Portofoliu", path: PROPERTY, roles: agencyRoles, context: "property:editing", steps: [
    { id: "welcome", title: "Editează proprietatea", text: "Ai deschis editarea. Nimic nu se salvează până apeși tu Salvează." },
    { id: "sections", title: "Secțiunile formularului", text: "Titlu și descriere, locație, tranzacție și preț, detalii complete și note interne.", selector: '#property-details-form' },
    { id: "required", title: "Ce cer portalurile", text: "Titlul, prețul, localizarea și suprafața sunt esențiale pentru publicare. Fila Publicare îți arată exact ce lipsește pe fiecare portal." },
    { id: "transaction", title: "Tranzacție și preț", text: "Alegi vânzare, închiriere sau ambele și completezi prețul corespunzător.", selector: '[data-tour="edit-transaction"]' },
    { id: "details", title: "Detalii complete", text: "Tip, camere, băi, etaj, suprafețe și facilități — cu cât mai complete, cu atât mai bun anunțul.", selector: '[data-tour="edit-details"]' },
    { id: "notes", title: "Note interne", text: "Notele de aici rămân în CRM și nu ajung pe site sau pe portaluri.", selector: '#internal_notes' },
    { id: "save", title: "Tu decizi salvarea", text: "Salvează actualizează anunțul și pregătește modificările pentru portalurile bifate. Ghidul se oprește aici, fără să apese butonul.", selector: '[data-tour="edit-save"]' },
  ]},
  { id: "property-media", title: "Fila Poze", group: "Portofoliu", path: PROPERTY, roles: agencyRoles, context: "property-tab:media", steps: [
    { id: "welcome", title: "Fila Poze", text: "Fotografiile vând anunțul. Vedem cum le gestionezi; nu încărcăm și nu ștergem nimic." },
    { id: "upload", title: "Încarcă fotografii", text: "Tragi imaginile aici sau apeși Alege fișiere. Încărcarea reală rămâne decizia ta.", selector: '[data-tour="media-upload"]' },
    { id: "order", title: "Ordinea și coperta", text: "Tragi fotografiile pentru ordine. Cea marcată Principală este coperta anunțului pe portaluri.", selector: '[data-tour="media-grid"]', optional: true, fallbackNote: "Grila de fotografii apare după prima imagine încărcată." },
    { id: "viewer", title: "Vizualizatorul", text: "Apasă o fotografie ca să o vezi mare, cu săgeți sau gesturi pe telefon.", selector: '[data-tour="media-grid"] button', mode: "do", event: "click", optional: true, hint: "Apasă orice fotografie din grilă.", confirmation: "Ai deschis vizualizatorul." },
    { id: "confidential", title: "Poze confidențiale", text: "Fotografiile marcate cu ochiul tăiat rămân în CRM: nu se publică și nu intră în fișa PDF." },
    { id: "ai", title: "Studio AI", text: "Cu Studio AI activat poți îmbunătăți fotografiile sau genera imagini de marketing, din pagina Studio AI.", feature: "ai_media" },
    { id: "portals", title: "Pozele ajung pe portaluri", text: "La următoarea publicare, portalurile primesc galeria în ordinea de aici, fără pozele confidențiale." },
  ]},
  { id: "property-publishing", title: "Fila Publicare", group: "Portofoliu", path: PROPERTY, roles: agencyRoles, context: "property-tab:publishing", steps: [
    { id: "welcome", title: "Fila Publicare", text: "De aici controlezi pe ce portaluri apare anunțul. Nu bifăm și nu publicăm nimic." },
    { id: "portals", title: "Alegi portalurile", text: "Bifezi portalurile dorite în modul Editează. Bifa se aplică abia la apăsarea butonului Publică.", selector: '[data-tour="publishing-portals"]' },
    { id: "validation", title: "Validările înainte de publicare", text: "Fiecare card îți spune ce lipsește — de exemplu etajul la apartamente sau telefonul agentului. Completezi din editare, apoi revii." },
    { id: "publish", title: "Butonul Publică", text: "Publică trimite anunțul cu bifele curente și aplică și modificările din formular. Ghidul se oprește aici — tu decizi când publici.", selector: '[data-tour="publishing-publish"]' },
    { id: "republish", title: "Republicare și retragere", text: "La eroare, Retrimite reia trimiterea. Debifarea unui portal urmată de Publică retrage anunțul de acolo." },
    { id: "journal", title: "Jurnalul portalului", text: "În dreapta vezi exact ce a răspuns fiecare portal la fiecare trimitere.", selector: '[data-tour="publishing-journal"]', optional: true, fallbackNote: "Jurnalul apare în dreapta pe ecrane late." },
  ]},
  { id: "property-promotions", title: "Promovare pe portaluri", group: "Portofoliu", path: PROPERTY, roles: agencyRoles, context: "property-tab:publishing", steps: [
    { id: "welcome", title: "Promovările pe portaluri", text: "Promovarea îți dă vizibilitate în plus pe portal, contra cost. Le explicăm; nu cumpărăm nimic." },
    { id: "imobiliare", title: "Promovări Imobiliare.ro", text: "Pe cardul Imobiliare.ro alegi tipul de promovare disponibil pentru anunț. Se aplică la următoarea publicare.", selector: '[data-tour="promo-imobiliare"]', optional: true, fallbackNote: "Promovările apar pe cardul Imobiliare.ro după ce bifezi portalul în modul Editează." },
    { id: "destination", title: "Imobiliare.ro sau doar imoradar24", text: "Alegi dacă anunțul merge pe ambele site-uri sau doar pe imoradar24.", selector: '[data-tour="promo-destination"]', optional: true, fallbackNote: "Alegerea destinației apare pe cardul Imobiliare.ro bifat." },
    { id: "promoted", title: "Bifa Promovat", text: "Portalurile cu promovare simplă au bifa Promovat pe card, tot aplicată la publicare." },
    { id: "stop", title: "Tu confirmi promovarea", text: "Ghidul se oprește aici, înainte de orice confirmare. Promovarea se cumpără doar prin publicarea făcută de tine." },
  ]},
  { id: "property-video-social", title: "Video și social", group: "Portofoliu", path: PROPERTY, roles: agencyRoles, context: "property-tab:promotion", steps: [
    { id: "welcome", title: "Video și social", text: "De aici promovezi anunțul pe rețele sociale. Nu postăm și nu publicăm nimic." },
    { id: "cards", title: "Ce poți crea", text: "Poster pentru feed sau story, video de prezentare și postări directe pe rețelele conectate.", selector: '[data-tour="social-cards"]' },
    { id: "video", title: "Video-ul proprietății", text: "Video-ul se generează din fotografii, cu animații. La generare alegi și muzica clipului din bibliotecă." },
    { id: "poster", title: "Posterul social", text: "Posterul folosește șabloane gata de postat, cu datele și pozele anunțului. Îl descarci sau îl trimiți mai departe." },
    { id: "networks", title: "Instagram, Facebook, YouTube", text: "Cu paginile conectate în Setări → Promovare postezi direct din CRM. Altfel, distribui de pe telefon sau cu linkul ofertei." },
    { id: "post", title: "Textul postării", text: "Textul se completează singur din datele anunțului și îl poți rescrie. Îl copiezi sau îl trimiți cu pozele.", selector: '[data-tour="social-post"]', optional: true },
    { id: "clips", title: "Clipurile mele", text: "Toate clipurile generate de tine, inclusiv cele nepublicate, le găsești în meniu la Clipurile mele." },
  ]},
  { id: "property-leads", title: "Lead-uri, cereri și activități", group: "Portofoliu", path: PROPERTY, roles: agencyRoles, context: ["property-tab:leads", "property-tab:matching", "property-tab:activities"], steps: [
    { id: "welcome", title: "Clienții proprietății", text: "Aici vezi cine e interesat și ce ai programat. Nu adăugăm și nu ștergem nimic." },
    { id: "leads", title: "Lead-urile", text: "Clienții legați de acest anunț, cu etapa și scorul fiecăruia.", selector: '[data-tour="property-tab-leads"]' },
    { id: "add", title: "Adaugă client (lead)", text: "Din Mai multe → Adaugă client legi un client de proprietate. Completezi tu datele; ghidul nu salvează." },
    { id: "matching", title: "Cereri compatibile", text: "Cererile care se potrivesc anunțului, cu scor și motive. Deschizi cererea și contactezi clientul.", selector: '[data-tour="property-tab-matching"]' },
    { id: "activities", title: "Activități", text: "Apeluri, vizionări și note legate de proprietate, în ordine cronologică.", selector: '[data-tour="property-tab-activities"]' },
    { id: "viewing", title: "Programează o vizionare", text: "Apasă Programează vizionare ca să vezi formularul. Se deschide fără să salveze; tu decizi dacă o păstrezi.", selector: '[data-tour="property-viewing"]', mode: "do", event: "click", hint: "Butonul este în partea de sus a paginii.", confirmation: "Ai deschis programarea. O poți închide fără să salvezi." },
  ]},
  { id: "property-documents", title: "Documente și Istoric", group: "Portofoliu", path: PROPERTY, roles: agencyRoles, context: ["property-tab:documents", "property-tab:history"], steps: [
    { id: "welcome", title: "Documente și Istoric", text: "Actele proprietății și jurnalul modificărilor, într-un singur loc." },
    { id: "documents", title: "Documente", text: "Contracte, acte și atașamente încărcate de echipă. Le poți descărca oricând.", selector: '[data-tour="property-tab-documents"]' },
    { id: "upload", title: "Încărcarea", text: "Încarci fișierele direct în filă. Rămân private, vizibile doar agenției tale." },
    { id: "history", title: "Istoric", text: "Cine a schimbat ce și când: statusuri, editări, publicări. Util la lucrul în echipă.", selector: '[data-tour="property-tab-history"]' },
  ]},
  { id: "property-acp", title: "Analiza comparativă de piață", group: "Portofoliu", path: PROPERTY, roles: agencyRoles, context: "property-tab:acp", steps: [
    { id: "welcome", title: "ACP — analiza de piață", text: "ACP estimează prețul corect din oferte comparabile reale, nu din presupuneri." },
    { id: "start", title: "Pornești o analiză", text: "Din această filă pornești analiza pentru proprietate. Calculul folosește oferte din zona și tipul ei.", selector: '[data-tour="property-acp"]' },
    { id: "report", title: "Unde găsești raportul", text: "Raportul rămâne salvat în pagina ACP din meniu, cu toate analizele agenției." },
    { id: "explain", title: "Cum citești rezultatul", text: "Vezi intervalul de preț, ofertele folosite și vechimea lor. Rezultatul este o estimare din date observate, nu o evaluare oficială." },
  ]},
  { id: "property-marketing", title: "Marketing AI", group: "Portofoliu", path: PROPERTY, roles: agencyRoles, context: "property-tab:marketing", feature: "ai_marketing", steps: [
    { id: "welcome", title: "Marketing AI", text: "Generează texte pentru anunț: titluri, descrieri și postări. Tu decizi ce folosești." },
    { id: "generate", title: "Ce generează", text: "Alegi tipul de conținut și tonul, iar AI propune textul din datele proprietății.", selector: '[data-tour="property-marketing"]' },
    { id: "use", title: "Cum folosești textul", text: "Îl citești, îl ajustezi și îl copiezi în anunț sau în postare. Nimic nu se salvează automat în proprietate." },
    { id: "check", title: "Verifică înainte de publicare", text: "Textul generat este o propunere: verifică prețul, suprafața și datele de contact înainte să-l folosești." },
  ]},
  { id: "collaboration", title: "Colaborare", group: "Rețea", path: "/app/collaboration", roles: agencyRoles, steps: [
    { id: "welcome", title: "Colaborare Habitoo", text: "Rețeaua în care agențiile își propun clienți una alteia. Nu trimitem și nu răspundem la nimic." },
    { id: "offers", title: "Oferte partenere", text: "Proprietăți ale altor agenții, deschise spre colaborare, cu comisionul afișat de agenția care deține mandatul.", selector: '[data-tour="collab-offers"]', optional: true, fallbackNote: "Ofertele apar aici când alte agenții marchează proprietăți pentru colaborare." },
    { id: "filters", title: "Filtrele", text: "Cauți după oraș, tip, tranzacție, preț sau camere, ca să găsești repede oferta potrivită.", selector: '[data-tour="collab-filters"]' },
    { id: "details", title: "Vezi detaliile unei oferte", text: "Apasă Detalii pe o ofertă ca să vezi pozele, descrierea și comisionul. Se deschide o fereastră, fără să trimiți ceva.", selector: '[data-tour="collab-offer-details"]', mode: "do", event: "click", optional: true, hint: "Butonul Detalii este pe fiecare ofertă din listă.", confirmation: "Ai deschis oferta. O poți închide oricând." },
    { id: "propose", title: "Propune unui client", text: "Din ofertă alegi Propune unui client și selectezi clientul tău. Propunerea pleacă doar după confirmarea ta — ghidul nu o trimite.", selector: '[data-tour="collab-offer-propose"]', optional: true, fallbackNote: "Butonul Propune unui client este pe fiecare ofertă." },
    { id: "tabs", title: "Trimise și primite", text: "Propunerile mele sunt cele trimise de tine; Cereri primite sunt propunerile altora pe proprietățile tale.", selector: '[data-tour="collab-tabs"]' },
    { id: "answer", title: "Cum răspunzi la o propunere", text: "Din Cereri primite deschizi discuția și accepți, programezi vizionarea sau refuzi. Mesajele merg direct la cealaltă agenție.", selector: '[data-tour="collab-incoming"]' },
  ]},
];

/** `:id` și orice segment care începe cu `:` se potrivește cu o valoare oarecare. */
export function guidePathMatches(guidePath: string, pathname: string): boolean {
  const path = pathname.replace(/\/$/, "") || "/";
  const want = guidePath.split("/").filter(Boolean);
  const have = path.split("/").filter(Boolean);
  if (want.length !== have.length) return false;
  return want.every((segment, i) => segment.startsWith(":") || segment === have[i]);
}

export function guideForPath(pathname: string): GuideDefinition | undefined {
  return implementedGuides.find((g) => !g.context && guidePathMatches(g.path, pathname));
}

export function guideForContext(pathname: string, context: string | null): GuideDefinition | undefined {
  if (!context) return undefined;
  return implementedGuides.find((g) => {
    const contexts = Array.isArray(g.context) ? g.context : g.context ? [g.context] : [];
    return contexts.includes(context) && guidePathMatches(g.path, pathname);
  });
}

/** Pașii vizibili pentru un utilizator: rolul și funcțiile AI decid ce se arată. */
export function stepsForUser(guide: GuideDefinition, role: AppRole, features: AiFeatureMap): TourStep[] {
  return guide.steps.filter((s) => (!s.roles || s.roles.includes(role)) && (!s.feature || features[s.feature]));
}

export function accessibleGuides(guides: GuideDefinition[], role: AppRole, features: AiFeatureMap): GuideDefinition[] {
  return guides.filter((g) => g.roles.includes(role) && (!g.feature || features[g.feature]));
}
export function acceptsGuideInput(value: string): boolean { return value.trim().length > 0; }
export function canShowAutomatically(autoStart: boolean, progress: { guide_id: string }[], id: string): boolean {
  return autoStart && !progress.some((p) => p.guide_id === id);
}
export const SAFE_SHOW_ACTIONS = ["menu", "portfolio", "clients", "management", "filters", "publish", "details"] as const;

export const GUIDE_CONTEXT_EVENT = "habitoo:guide-context";
/** Paginile anunță contextul (filă deschisă, editare pornită) ca să pornească ghidul potrivit. */
export function announceGuideContext(key: string): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(GUIDE_CONTEXT_EVENT, { detail: key }));
}
