// Conținutul static al paginii publice „Agenții partenere”.
//
// Fără citiri din baza de date: agențiile propriu-zise le primește ruta din
// `listPublicPartners` (funcția publică `public_partner_agencies`). Textul de
// mai jos descrie programul de parteneriat și regulile concrete ale listei,
// deci pagina rămâne utilă și când lista este temporar goală.

export const PUBLIC_PARTNER_AGENCIES_PATH = "/agentii";

export const PUBLIC_PARTNER_AGENCIES_TITLE = "Agenții partenere | Habitoo CRM";

export const PUBLIC_PARTNER_AGENCIES_DESCRIPTION =
  "Agențiile imobiliare care lucrează cu Habitoo CRM, ce oferă parteneriatul și cum apare o agenție în lista publică.";

/** Rutele publice existente pe care le poate trimite pagina. */
export type PartnerContentPath =
  | "/functionalitati"
  | "/integrari"
  | "/colaborare-intre-agentii"
  | "/anunturi-proprietari"
  | "/analiza-comparativa-de-piata"
  | "/preturi"
  | "/contact";

export type PartnerProgramSection = {
  title: string;
  text: string;
  to?: PartnerContentPath;
  linkLabel?: string;
};

/** Ce înseamnă, concret, calitatea de agenție parteneră Habitoo. */
export const partnerProgramSections: PartnerProgramSection[] = [
  {
    title: "Un singur sistem pentru portofoliu și clienți",
    text: "Agențiile din listă își țin proprietățile, clienții, cererile, lead-urile și programările în Habitoo CRM. Din același loc văd comisioanele, istoricul acțiunilor și rapoartele echipei, fără să copieze datele în mai multe aplicații.",
    to: "/functionalitati",
    linkLabel: "Ce include platforma",
  },
  {
    title: "Anunțuri publicate pe portaluri dintr-un singur loc",
    text: "O agenție parteneră publică și actualizează anunțurile din Habitoo pe portalurile conectate — Imobiliare.ro, Storia.ro, imo24.ro, ZonaTa.ro, HomeDirect.ro, Imopedia.ro, VDI.ro, Properstar, La Cheie, Imospot.ro, Romimo.ro, PrimulAnunț.ro, ZUP.ro, Ofera.ro, HomePitch.ro și iMove.ro — și intră în indexurile partenerilor ClickImob, Locuit.ro, Imobli.ro și Imobiliare+. Prețul, fotografiile și descrierea se completează o singură dată.",
    to: "/integrari",
    linkLabel: "Portaluri conectate",
  },
  {
    title: "Colaborare cu alte agenții din platformă",
    text: "Agențiile își pot deschide proprietățile către alte agenții Habitoo, cu comision stabilit de fiecare. Partenera aduce clientul, datele proprietarului și notele interne rămân în agenția care a publicat proprietatea.",
    to: "/colaborare-intre-agentii",
    linkLabel: "Cum funcționează colaborarea",
  },
  {
    title: "Ceri de la proprietari și potriviri automate",
    text: "Cererile venite de la proprietari intră direct în contul agenției, iar fiecare lead primește potriviri automate cu portofoliul existent, pe criteriile de preț, zonă și număr de camere. Agentul vede matching-ul din fișa lead-ului și din fișa proprietății.",
    to: "/anunturi-proprietari",
    linkLabel: "Anunțuri de la proprietari",
  },
  {
    title: "Piața analizată din date reale, nu din estimări",
    text: "Analiza comparativă de piață (ACP) construiește comparații din ofertele agenției, din colaborări și din sursele de piață autorizate, cu istoric de prețuri și durată pe piață. Habitoo nu cumpără anunțuri și nu publică promovări plătite în numele agenției.",
    to: "/analiza-comparativa-de-piata",
    linkLabel: "Despre ACP",
  },
];

/** Regulile concrete care decid cine apare în lista publică. */
export const partnerListingRules: { title: string; text: string }[] = [
  {
    title: "Cont activ sau în perioada de probă",
    text: "O agenție apare în listă cât timp are cont activ în Habitoo sau este în perioada de probă. Conturile arhivate, suspendate, anulate sau în așteptarea aprobării nu mai apar.",
  },
  {
    title: "Fără cerere de înscriere și fără taxă",
    text: "Numele și logo-ul agenției (sau inițialele, dacă nu a încărcat încă un logo) apar automat, fără dosar de parteneriat și fără cost de listare.",
  },
  {
    title: "Pagină proprie de profil, opțională",
    text: "Cu opțiunea „Profil public pe site” activată în Setări → Agenție, agenția primește o pagină proprie cu descrierea ei și lista agenților publici. Fără această bifă rămâne doar cartea de vizită din listă.",
  },
  {
    title: "Datele de contact nu se publică",
    text: "Pe site-ul public nu afișăm telefonul, emailul sau adresa agenției. Numele unui agent și telefonul lui apar pe pagina de profil doar dacă agentul a ales să le facă publice.",
  },
  {
    title: "Agenția poate cere scoaterea din listă",
    text: "O agenție care nu mai dorește să apară poate cere scoaterea din lista publică; listarea se oprește imediat, iar profilul public devine indisponibil.",
  },
];

export const partnerAgenciesFaq: { q: string; a: string }[] = [
  {
    q: "Cum apare agenția mea în lista aceasta?",
    a: "Automat. În momentul în care contul agenției este activ sau în perioada de probă, numele și logo-ul intra în lista „Agenții partenere”. Nu există dosar de înscriere, aprobare sau taxă de listare.",
  },
  {
    q: "Ce vede un vizitator despre agenția mea?",
    a: "Numele și logo-ul (sau inițialele). Dacă ați activat „Profil public pe site” în Setări → Agenție, vizitatorul mai vede o pagină proprie cu descrierea agenției și agenții publici. Datele de contact ale agenției nu se publică.",
  },
  {
    q: "Pot scoate agenția din listă?",
    a: "Da. Cereți scoaterea din lista publică și agenția dispare imediat; la fel se întâmplă când contul este arhivat, suspendat sau anulat.",
  },
  {
    q: "Ce primește concret o agenție parteneră?",
    a: "Un CRM complet: portofoliu și clienți, publicare pe portalurile conectate, colaborare cu alte agenții, cereri de la proprietari, potriviri automate pentru lead-uri, comisioane și rapoarte, plus analiza comparativă de piață.",
  },
  {
    q: "Câte agenții sunt în listă?",
    a: "Lista conține agențiile cu cont activ sau în perioada de probă la momentul încărcării paginii, deci se poate schimba de la o zi la alta. Numărul afișat deasupra listei este cel din acel moment.",
  },
];
