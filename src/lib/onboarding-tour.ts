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
};
export type GuideDefinition = {
  id: string; title: string; group: string; path: string;
  roles: AppRole[]; feature?: AiFeatureKey; steps: TourStep[];
};
export const GUIDE_IDS = ["first-steps", "properties-list", "property-create"] as const;
export type GuideId = (typeof GUIDE_IDS)[number];
const agencyRoles: AppRole[] = ["agent", "agency_admin", "superadmin"];
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
];
export function guideForPath(pathname: string): GuideDefinition | undefined {
  const path = pathname.replace(/\/$/, "") || "/";
  return implementedGuides.find((g) => g.path === path);
}
export function accessibleGuides(guides: GuideDefinition[], role: AppRole, features: AiFeatureMap): GuideDefinition[] {
  return guides.filter((g) => g.roles.includes(role) && (!g.feature || features[g.feature]));
}
export function acceptsGuideInput(value: string): boolean { return value.trim().length > 0; }
export function canShowAutomatically(autoStart: boolean, progress: { guide_id: string }[], id: string): boolean {
  return autoStart && !progress.some((p) => p.guide_id === id);
}
export const SAFE_SHOW_ACTIONS = ["menu", "portfolio", "clients", "management", "filters", "publish", "details"] as const;
