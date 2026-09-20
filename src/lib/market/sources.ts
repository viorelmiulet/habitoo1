/**
 * Registrul surselor autorizate de date de piață.
 *
 * O sursă apare aici doar dacă datele pot fi obținute legal: feed/API pe care
 * agenția îl deține, export furnizat de portal sau date interne Habitoo.
 * `pull: false` înseamnă că Habitoo NU are un import automat pentru sursa
 * respectivă — datele se încarcă manual, ca fișier JSON sau CSV. Nu simulăm
 * integrări inexistente și nu facem scraping.
 */
import type { MarketFieldMapping } from "./normalize";

export type MarketSourceId = string;

export type MarketSourceDefinition = {
  id: MarketSourceId;
  name: string;
  /** Cine furnizează datele și în ce condiții. */
  description: string;
  /** Formate acceptate la import. */
  formats: ("json" | "csv")[];
  /** Există un import automat implementat (pull) pentru această sursă? */
  pull: boolean;
  /** Portalul echivalent din registrul de publicare, dacă există. */
  portalId?: string;
  /** Maparea implicită a câmpurilor; poate fi suprascrisă la import. */
  mapping: MarketFieldMapping;
  notes?: string;
};

/** Mapare generică Habitoo: cheile sunt exact numele câmpurilor normalizate. */
export const HABITOO_MAPPING: MarketFieldMapping = {
  sourceListingId: ["sourceListingId", "source_listing_id", "id", "external_id", "reference"],
  url: ["url", "link", "listing_url"],
  title: ["title", "titlu", "name"],
  imageUrl: ["imageUrl", "image_url", "photo", "image", "main_image"],
  propertyType: ["propertyType", "property_type", "tip", "tip_proprietate", "category"],
  transactionType: ["transactionType", "transaction_type", "tranzactie", "offer_type"],
  city: ["city", "oras", "localitate", "locality"],
  county: ["county", "judet", "region"],
  district: ["district", "sector", "zona"],
  neighborhood: ["neighborhood", "cartier", "area"],
  address: ["address", "adresa", "street_address", "strada"],
  latitude: ["latitude", "lat"],
  longitude: ["longitude", "lng", "lon"],
  rooms: ["rooms", "camere", "nr_camere", "no_rooms"],
  bathrooms: ["bathrooms", "bai", "nr_bai"],
  usableArea: ["usableArea", "usable_area", "suprafata_utila", "sup_utila"],
  totalArea: ["totalArea", "total_area", "suprafata", "suprafata_construita", "surface"],
  floor: ["floor", "etaj"],
  totalFloors: ["totalFloors", "total_floors", "etaje", "nr_etaje"],
  constructionYear: ["constructionYear", "construction_year", "an_constructie", "year"],
  price: ["price", "pret", "amount"],
  currency: ["currency", "moneda", "valuta"],
  condition: ["condition", "stare", "finisaje"],
  furnished: ["furnished", "mobilat"],
  parking: ["parking", "parcare", "garaj"],
  balcony: ["balcony", "balcon", "terasa"],
  features: ["features", "dotari", "facilities"],
  status: ["status", "stare_anunt", "state"],
};

export const MARKET_SOURCES: MarketSourceDefinition[] = [
  {
    id: "habitoo_internal",
    name: "Date interne Habitoo",
    description: "Oferte introduse de platformă pe baza datelor proprii ale agențiilor.",
    formats: ["json", "csv"],
    pull: false,
    mapping: HABITOO_MAPPING,
  },
  {
    id: "immoflux",
    name: "ImmoFlux",
    description: "Export furnizat prin feedul ImmoFlux al agenției.",
    formats: ["json", "csv"],
    pull: false,
    portalId: "oferteimobiliare",
    mapping: HABITOO_MAPPING,
    notes: "Integrarea Habitoo este de publicare; importul se face din exportul primit.",
  },
  {
    id: "clickimob",
    name: "ClickImob",
    description: "Export CSV/JSON pus la dispoziție de ClickImob.",
    formats: ["json", "csv"],
    pull: false,
    portalId: "clickimob",
    mapping: HABITOO_MAPPING,
  },
  {
    id: "imove",
    name: "iMove.ro",
    description: "Export CSV al ofertelor iMove.",
    formats: ["csv", "json"],
    pull: false,
    portalId: "imove",
    mapping: HABITOO_MAPPING,
  },
  {
    id: "imobiliare_ro",
    name: "Imobiliare.ro",
    description: "Date furnizate contractual de Imobiliare.ro.",
    formats: ["json", "csv"],
    pull: false,
    portalId: "imobiliare_ro",
    mapping: HABITOO_MAPPING,
    notes: "Fără API public de citire; importul necesită export furnizat de portal.",
  },
  {
    id: "storia",
    name: "Storia.ro",
    description: "Date furnizate prin contul OLX/Storia al agenției.",
    formats: ["json", "csv"],
    pull: false,
    portalId: "storia",
    mapping: HABITOO_MAPPING,
    notes: "API-ul Storia conectat în Habitoo nu expune listări de piață pentru citire.",
  },
  {
    id: "olx",
    name: "OLX",
    description: "Date furnizate prin contul OLX al agenției.",
    formats: ["json", "csv"],
    pull: false,
    portalId: "olx",
    mapping: HABITOO_MAPPING,
  },
  {
    id: "publi24",
    name: "Publi24",
    description: "Export furnizat de Publi24.",
    formats: ["json", "csv"],
    pull: false,
    portalId: "publi24",
    mapping: HABITOO_MAPPING,
  },
];

export function findMarketSource(id: string): MarketSourceDefinition | null {
  return MARKET_SOURCES.find((s) => s.id === id) ?? null;
}

export function marketSourceName(id: string): string {
  const known = findMarketSource(id);
  if (known) return known.name;
  // Sursele Apify sunt configurate, nu declarate în cod: le etichetăm generic.
  if (id.startsWith("apify:")) return `Apify · ${id.slice("apify:".length)}`;
  return id;
}
