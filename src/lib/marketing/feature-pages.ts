/**
 * Funcționalitățile Habitoo CRM: paginile dedicate /functionalitati/<slug> și cuprinsul de pe /functionalitati.
 * Textele sunt pentru agenți, fără termeni tehnici, prețuri sau nume de persoane.
 */
import { publicPortalCount } from "@/lib/portals/integration-pages";

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
export const FEATURE_PAGES: FeaturePage[] = [];

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
  { key: "integrari", name: "Publicare pe portaluri", summary: `Publici proprietățile pe ${publicPortalCount()} portaluri imobiliare direct din Habitoo, cu actualizare și retragere automată.`, category: "Portofoliu și publicare", to: "/integrari", kind: "external" },
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

/** Cuprinsul complet, în ordinea categoriilor. O pagină dedicată înlocuiește secțiunea cu același slug. */
export const FEATURE_ENTRIES: FeatureEntry[] = (() => {
  const pageKeys = new Set(PAGE_ENTRIES.map((e) => e.key));
  const all = [...EXTERNAL, ...PAGE_ENTRIES, ...SECTIONS.filter((s) => !pageKeys.has(s.key))];
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
