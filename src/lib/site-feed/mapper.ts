/**
 * Mapper pur (fără DB, fără rețea) între modelul Habitoo și formatul feedului
 * public pentru portaluri imobiliare. Compatibil, unde este util, cu structura
 * documentată public de ImmoFlux; câmpurile inexistente în Habitoo rămân null.
 */
import type { Tables } from "@/integrations/supabase/types";

export type PropertyRow = Tables<"properties">;
export type PropertyImageRow = Tables<"property_images">;
export type ProfileRow = Tables<"profiles">;

export type FeedImage = {
  src: string;
  tip: string;
  pozitie: number;
  modificata: string | null;
  alt: string | null;
  width: number | null;
  height: number | null;
};

export type FeedAgent = {
  idstr: string;
  nume: string;
  email: string | null;
  telefon: string | null;
  functie: string | null;
  poza: string | null;
  activ: boolean;
};

export type FeedProperty = {
  idnum: number | null;
  idstr: string;
  alias: string;
  agent: string | null;
  agent_id: string | null;
  dataadaugare: string | null;
  datamodificare: string | null;
  adresa: string | null;
  titlu: { ro: string; en: string | null };
  descriere: { ro: string | null; en: string | null };
  vecinatati: string[];
  utilitati: string[];
  finisaje: string[];
  dotari: string[];
  altedetaliizona: string | null;
  pretnegociabil: boolean;
  longitudine: number | null;
  latitudine: number | null;
  tiplocuinta: string | null;
  tipimobil: string | null;
  tipteren: string | null;
  clasificareteren: string | null;
  suprafatateren: number | null;
  nrcamere: number | null;
  nrdormitoare: number | null;
  nrbucatarii: number | null;
  etaj: number | null;
  tipcompartimentare: string | null;
  suprafatautila: number | null;
  confort: string | null;
  suprafataconstruita: number | null;
  anconstructie: number | null;
  nrbai: number | null;
  nrnivele: number | null;
  nrbalcoane: number | null;
  nrgaraje: number | null;
  stadiuconstructie: string | null;
  structurarezistenta: string | null;
  status: string;
  localitate: string | null;
  judet: string | null;
  zona: string | null;
  strada: string | null;
  numarstradal: string | null;
  cod_siruta_judet: number | null;
  cod_siruta_uat: number | null;
  cod_siruta_localitate: number | null;
  caroiaj: string | null;
  devanzare: boolean;
  deinchiriere: boolean;
  monedavanzare: string | null;
  monedainchiriere: string | null;
  pretvanzare: number | null;
  pretinchiriere: number | null;
  pretfaratva: number | null;
  tvainclus: boolean | null;
  comisioncumparator: string | null;
  referintaexterna: string | null;
  images: FeedImage[];
  publicare: boolean;
  top: boolean;
  pole: boolean;
  custom1: string | null;
  custom2: string | null;
  portals: string[];
  suprafata_value: number | null;
  incalzire_value: string | null;
  mobilare_value: string | null;
  parcare_value: string | null;
  balcon_value: boolean | null;
  energy: {
    clasa: string | null;
    consum: number | null;
    emisii: number | null;
  };
  url: string | null;
};

/** Statusurile Habitoo care pot apărea în feedul public. */
export const FEED_PUBLIC_STATUSES = ["active", "reserved", "negotiation"] as const;

export function isPropertyFeedEligible(p: Pick<PropertyRow, "publish_status" | "deleted_at" | "status">): boolean {
  if (p.deleted_at) return false;
  if (p.publish_status !== "published") return false;
  return (FEED_PUBLIC_STATUSES as readonly string[]).includes(p.status);
}

function numericId(reference: string | null): number | null {
  if (!reference) return null;
  const digits = reference.replace(/\D+/g, "");
  if (!digits) return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
}

/** URL public stabil pentru o imagine din feed (proxy semnat server-side). */
export function feedImageUrl(baseUrl: string, imageId: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/public/sites/v1/media/${imageId}`;
}

/** URL public stabil al ofertei pe site: /oferta/{propertyId}. */
export function offerUrl(publicSiteUrl: string, propertyId: string): string {
  return `${publicSiteUrl.replace(/\/$/, "")}/oferta/${propertyId}`;
}

export function mapImage(image: PropertyImageRow, baseUrl: string): FeedImage {
  return {
    src: feedImageUrl(baseUrl, image.id),
    tip: image.is_primary ? "principala" : "galerie",
    pozitie: image.position ?? 0,
    modificata: image.updated_at ?? null,
    alt: image.alt ?? null,
    width: image.width ?? null,
    height: image.height ?? null,
  };
}

export function isImageFeedEligible(image: PropertyImageRow): boolean {
  return image.include_in_publish === true && image.is_confidential !== true;
}

export function mapAgent(profile: ProfileRow, baseUrl?: string): FeedAgent {
  void baseUrl;
  return {
    idstr: profile.id,
    nume: profile.full_name,
    email: profile.email ?? null,
    telefon: profile.phone ?? null,
    functie: profile.job_title ?? null,
    poza: profile.avatar_url ?? null,
    activ: profile.is_active,
  };
}

export type MapPropertyOptions = {
  /** Origin absolut HTTPS pentru URL-urile de imagine (ex. https://crm.habitoo.ro). */
  baseUrl: string;
  /** Origin absolut al site-ului public, pentru linkul /oferta-{id}. */
  publicSiteUrl?: string;
  images?: PropertyImageRow[];
  agent?: Pick<ProfileRow, "id" | "full_name"> | null;
  /**
   * Portalurile pentru care oferta are publicare activă în modelul generic
   * `portal_publications`. Se combină cu tagurile legacy `portal:<nume>`.
   */
  portalKeys?: string[];
};

export function mapPropertyToFeed(p: PropertyRow, options: MapPropertyOptions): FeedProperty {
  const isRent = p.transaction_kind === "rent";
  const images = (options.images ?? [])
    .filter(isImageFeedEligible)
    .sort((a, b) => (a.is_primary === b.is_primary ? (a.position ?? 0) - (b.position ?? 0) : a.is_primary ? -1 : 1))
    .map((img) => mapImage(img, options.baseUrl));

  const isLand = p.property_type === "land";
  const isResidential = ["apartment", "studio", "house", "villa"].includes(p.property_type);

  return {
    idnum: numericId(p.reference),
    idstr: p.reference ?? p.id,
    alias: `oferta-${p.id}`,
    agent: options.agent?.full_name ?? null,
    agent_id: p.assigned_to ?? null,
    dataadaugare: p.created_at ?? null,
    datamodificare: p.updated_at ?? null,
    adresa: p.address ?? null,
    titlu: { ro: p.title, en: null },
    descriere: { ro: p.description ?? null, en: null },
    vecinatati: [],
    utilitati: p.utilities ?? [],
    finisaje: [],
    dotari: p.features ?? [],
    altedetaliizona: p.district ?? null,
    pretnegociabil: Boolean(p.negotiable),
    longitudine: p.lng ?? null,
    latitudine: p.lat ?? null,
    tiplocuinta: isResidential ? p.property_type : null,
    tipimobil: p.property_type,
    tipteren: isLand ? (p.category ?? null) : null,
    clasificareteren: isLand ? (p.category ?? null) : null,
    suprafatateren: p.land_surface ?? null,
    nrcamere: p.rooms ?? null,
    nrdormitoare: p.bedrooms ?? null,
    nrbucatarii: null,
    etaj: p.floor ?? null,
    tipcompartimentare: p.layout ?? null,
    suprafatautila: p.usable_surface ?? null,
    confort: null,
    suprafataconstruita: p.built_surface ?? null,
    anconstructie: p.build_year ?? null,
    nrbai: p.bathrooms ?? null,
    nrnivele: p.building_floors ?? null,
    nrbalcoane: null,
    nrgaraje: null,
    stadiuconstructie: null,
    structurarezistenta: null,
    status: p.status,
    localitate: p.city ?? null,
    judet: p.county ?? null,
    zona: p.district ?? null,
    strada: p.street ?? null,
    numarstradal: p.street_number ?? null,
    cod_siruta_judet: p.county_siruta_code ?? null,
    cod_siruta_uat: p.uat_siruta_code ?? null,
    cod_siruta_localitate: p.locality_siruta_code ?? null,
    caroiaj: null,
    devanzare: !isRent,
    deinchiriere: isRent,
    monedavanzare: isRent ? null : (p.currency ?? null),
    monedainchiriere: isRent ? (p.currency ?? null) : null,
    pretvanzare: isRent ? null : (p.price ?? null),
    pretinchiriere: isRent ? (p.price ?? null) : null,
    // Modelul intern nu garantează că `price` este prețul fără TVA când
    // `vat_included = false`, deci nu publicăm o valoare derivată greșit.
    pretfaratva: null,
    tvainclus: typeof p.vat_included === "boolean" ? p.vat_included : null,
    // `properties.commission` este comision intern (nepublic) → nu se expune.
    comisioncumparator: null,
    referintaexterna: p.external_id ?? null,
    images,
    publicare: p.publish_status === "published",
    top: (p.tags ?? []).includes("top"),
    pole: (p.tags ?? []).includes("pole"),
    custom1: null,
    custom2: null,
    // Sursa principală: modelul generic `portal_publications` (publicare activă).
    // Compatibilitate: tagurile legacy `portal:<nume>`. Fără niciuna, lista e goală.
    portals: [
      ...new Set([
        ...(options.portalKeys ?? []),
        ...(p.tags ?? []).filter((t) => t.startsWith("portal:")).map((t) => t.slice("portal:".length)),
      ]),
    ],
    suprafata_value: p.surface ?? null,
    incalzire_value: p.heating ?? null,
    mobilare_value: p.furnishing ?? null,
    parcare_value: p.parking ?? null,
    balcon_value: typeof p.balcony === "boolean" ? p.balcony : null,
    energy: { clasa: null, consum: null, emisii: null },
    url: options.publicSiteUrl ? offerUrl(options.publicSiteUrl, p.id) : null,
  };
}

export type PaginatedFeed<T> = {
  total: number;
  per_page: number;
  current_page: number;
  last_page: number;
  next_page_url: string | null;
  prev_page_url: string | null;
  from: number | null;
  to: number | null;
  data: T[];
};

export const FEED_DEFAULT_PER_PAGE = 50;
export const FEED_MAX_PER_PAGE = 200;

export function parsePagination(url: URL): { page: number; perPage: number } {
  const rawPage = Number(url.searchParams.get("page") ?? "1");
  const rawPerPage = Number(url.searchParams.get("per_page") ?? FEED_DEFAULT_PER_PAGE);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const perPage = Number.isFinite(rawPerPage) && rawPerPage >= 1
    ? Math.min(Math.floor(rawPerPage), FEED_MAX_PER_PAGE)
    : FEED_DEFAULT_PER_PAGE;
  return { page, perPage };
}

export function buildPaginatedFeed<T>(input: {
  data: T[];
  total: number;
  page: number;
  perPage: number;
  requestUrl: URL;
}): PaginatedFeed<T> {
  const { data, total, page, perPage, requestUrl } = input;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  const pageUrl = (p: number) => {
    const u = new URL(requestUrl.toString());
    u.searchParams.set("page", String(p));
    u.searchParams.set("per_page", String(perPage));
    return u.toString();
  };
  const from = total === 0 ? null : (page - 1) * perPage + 1;
  const to = total === 0 ? null : Math.min(page * perPage, total);
  return {
    total,
    per_page: perPage,
    current_page: page,
    last_page: lastPage,
    next_page_url: page < lastPage ? pageUrl(page + 1) : null,
    prev_page_url: page > 1 ? pageUrl(page - 1) : null,
    from,
    to: total === 0 ? null : Math.max(from ?? 0, Math.min(to ?? 0, total)),
    data,
  };
}

/** Fereastra acceptată pentru datele raportate de site (zile). */
export const VISIT_DATE_MAX_PAST_DAYS = 365;
export const VISIT_DATE_MAX_FUTURE_DAYS = 1;

/**
 * Validare reală de dată calendaristică (nu doar regex): `2026-99-99` este
 * respinsă, la fel și datele prea vechi sau din viitor îndepărtat.
 */
export function isVisitDateAcceptable(value: string, now: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  if (parsed.toISOString().slice(0, 10) !== value) return false; // 2026-02-31 → invalid
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const diffDays = Math.round((parsed.getTime() - today.getTime()) / 86_400_000);
  return diffDays <= VISIT_DATE_MAX_FUTURE_DAYS && diffDays >= -VISIT_DATE_MAX_PAST_DAYS;
}
