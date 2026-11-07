/**
 * Partner API v1 — stable English schema built on top of the feed mapper.
 * Pure module: no database access. Eligibility stays in the feed selection
 * (selectedPropertyIdsForPortal + isPropertyFeedEligible); this file only
 * reshapes the already-mapped feed object.
 */
import { CRM_URL } from "@/lib/host";
import {
  feedImageUrl, agentPhotoUrl, agencyLogoFeedUrl, mapPropertyToFeed,
  type PropertyRow, type PropertyImageRow, type ProfileRow,
} from "@/lib/site-feed/mapper";
import {
  layoutOptions, heatingOptions, furnishingOptions, parkingOptions, additionalSpaceOptions,
  kitchenOptions, meteringOptions, applianceOptions, buildingAmenityOptions,
  streetArrangementOptions, viewOptions, miscFeatureOptions, coolingOptions,
} from "@/lib/property-taxonomy";

/** Stable code: lowercase ASCII snake_case of the Romanian label. */
export function taxonomyCode(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
const fromLabels = (labels: readonly string[]) => labels.map(label => ({ code: taxonomyCode(label), label }));
const codeOrNull = (v: string | null | undefined) => (v && v.trim() ? taxonomyCode(v) : null);

export const PROPERTY_TYPES = [
  { code: "apartment", label: "Apartament" }, { code: "studio", label: "Garsonieră" },
  { code: "house", label: "Casă" }, { code: "villa", label: "Vilă" }, { code: "land", label: "Teren" },
  { code: "commercial", label: "Spațiu comercial" }, { code: "office", label: "Birou" },
  { code: "industrial", label: "Hală / spațiu industrial" }, { code: "duplex", label: "Duplex" },
  { code: "penthouse", label: "Penthouse" }, { code: "other", label: "Altele" },
];
export const FEATURE_LABELS = [...new Set([
  ...additionalSpaceOptions, ...kitchenOptions, ...meteringOptions, ...applianceOptions, ...buildingAmenityOptions,
  ...streetArrangementOptions, ...viewOptions, ...miscFeatureOptions, ...coolingOptions,
])];
export const TAXONOMIES = {
  listing_status: [
    { code: "active", label: "Activ" }, { code: "reserved", label: "Rezervat" }, { code: "withdrawn", label: "Retras" },
  ],
  offer_type: [{ code: "sale", label: "Vânzare" }, { code: "rent", label: "Închiriere" }],
  currency: [{ code: "EUR", label: "Euro" }, { code: "RON", label: "Leu" }, { code: "USD", label: "Dolar american" }],
  property_type: PROPERTY_TYPES,
  layout: fromLabels(layoutOptions),
  heating: fromLabels(heatingOptions),
  furnishing: fromLabels(furnishingOptions),
  parking: fromLabels(parkingOptions),
  energy_class: ["A++", "A+", "A", "B", "C", "D", "E", "F", "G"].map(c => ({ code: c, label: `Clasa ${c}` })),
  features: fromLabels(FEATURE_LABELS),
  event_type: [
    { code: "listing.upserted", label: "Anunț nou sau modificat" }, { code: "listing.withdrawn", label: "Anunț retras" },
    { code: "agency.activated", label: "Agenție activată" }, { code: "agency.deactivated", label: "Agenție dezactivată" },
    { code: "agent.updated", label: "Agent modificat" },
  ],
} as const;

export type ListingStatus = "active" | "reserved" | "withdrawn";
export type PartnerOffer = { type: "sale" | "rent"; price: number | null; currency: string | null; vat_included: boolean | null; negotiable: boolean };
export type PartnerListing = {
  id: string; reference: string | null; agency_id: string; agent_id: string | null; status: ListingStatus;
  offers: PartnerOffer[]; property_type: string | null; property_subtype: string | null; title: string | null; description: string | null;
  rooms: number | null; bedrooms: number | null; bathrooms: number | null; kitchens: number | null; balconies: number | null;
  usable_area: number | null; built_area: number | null; land_area: number | null; floor: number | null; floors_total: number | null; build_year: number | null;
  layout: string | null; heating: string | null; furnishing: string | null; parking: string | null; energy_class: string | null; features: string[];
  location: { county: string | null; city: string | null; district: string | null; street: string | null; street_number: string | null; latitude: number | null; longitude: number | null; is_precise: boolean };
  images: { url: string; position: number; is_cover: boolean }[]; floor_plans: { url: string; position: number }[];
  video_url: string | null; virtual_tour_url: string | null;
  created_at: string | null; updated_at: string | null; withdrawn_at: string | null;
};

const TYPE_CODES = new Set(PROPERTY_TYPES.map(t => t.code));
/** Payload stored in the portal state. `updated_at`/`withdrawn_at` come from the state row at read time. */
export function mapPartnerListing(row: PropertyRow, images: PropertyImageRow[], baseUrl = CRM_URL): PartnerListing {
  const feed = mapPropertyToFeed(row, { baseUrl, images });
  const precise = row.location_precise === true;
  const offers: PartnerOffer[] = [];
  if (feed.devanzare) offers.push({ type: "sale", price: feed.pretvanzare, currency: feed.monedavanzare, vat_included: feed.tvainclus, negotiable: feed.pretnegociabil });
  if (feed.deinchiriere) offers.push({ type: "rent", price: feed.pretinchiriere, currency: feed.monedainchiriere, vat_included: feed.tvainclus, negotiable: feed.pretnegociabil });
  return {
    id: row.id, reference: row.reference ?? null, agency_id: row.organization_id, agent_id: row.assigned_to ?? null,
    status: row.status === "active" ? "active" : "reserved",
    offers,
    property_type: TYPE_CODES.has(row.property_type) ? row.property_type : "other",
    property_subtype: codeOrNull(row.category), title: row.title ?? null, description: row.description ?? null,
    rooms: feed.nrcamere, bedrooms: feed.nrdormitoare, bathrooms: feed.nrbai, kitchens: feed.nrbucatarii, balconies: feed.nrbalcoane,
    usable_area: feed.suprafatautila, built_area: feed.suprafataconstruita, land_area: feed.suprafatateren,
    floor: feed.etaj, floors_total: feed.nrnivele, build_year: feed.anconstructie,
    layout: codeOrNull(feed.tipcompartimentare), heating: codeOrNull(feed.incalzire_value), furnishing: codeOrNull(feed.mobilare_value),
    parking: codeOrNull(feed.parcare_value), energy_class: row.energy_class?.trim().toUpperCase() || null,
    features: [...new Set(feed.dotari.map(taxonomyCode).filter(Boolean))].sort(),
    location: {
      county: feed.judet, city: feed.localitate, district: feed.zona,
      // Imprecise location: never street or number; coordinates are already approximated by publicCoords.
      street: precise ? feed.strada : null, street_number: precise ? feed.numarstradal : null,
      latitude: feed.latitudine, longitude: feed.longitudine, is_precise: precise,
    },
    images: feed.images.map((img, i) => ({ url: img.src, position: i, is_cover: i === 0 })),
    floor_plans: [], video_url: null, virtual_tour_url: null,
    created_at: row.created_at ?? null, updated_at: null, withdrawn_at: null,
  };
}
export { feedImageUrl };

/** Withdrawn listings keep only identification and dates. */
export function withdrawnTombstone(previous: Pick<PartnerListing, "id" | "reference" | "agency_id" | "agent_id" | "created_at">): PartnerListing {
  return {
    id: previous.id, reference: previous.reference, agency_id: previous.agency_id, agent_id: previous.agent_id, status: "withdrawn",
    offers: [], property_type: null, property_subtype: null, title: null, description: null,
    rooms: null, bedrooms: null, bathrooms: null, kitchens: null, balconies: null, usable_area: null, built_area: null, land_area: null,
    floor: null, floors_total: null, build_year: null, layout: null, heating: null, furnishing: null, parking: null, energy_class: null, features: [],
    location: { county: null, city: null, district: null, street: null, street_number: null, latitude: null, longitude: null, is_precise: false },
    images: [], floor_plans: [], video_url: null, virtual_tour_url: null,
    created_at: previous.created_at, updated_at: null, withdrawn_at: null,
  };
}

export type PartnerAgent = { id: string; agency_id: string; name: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null; photo_url: string | null; position: string | null };
export function mapPartnerAgent(p: Pick<ProfileRow, "id" | "organization_id" | "full_name" | "email" | "phone" | "avatar_url" | "job_title">, baseUrl = CRM_URL): PartnerAgent {
  const name = (p.full_name ?? "").trim(); const space = name.indexOf(" ");
  return {
    id: p.id, agency_id: p.organization_id ?? "", name,
    first_name: name ? (space > 0 ? name.slice(0, space) : name) : null, last_name: space > 0 ? name.slice(space + 1) : null,
    email: p.email ?? null, phone: p.phone ?? null, photo_url: agentPhotoUrl(p, baseUrl), position: p.job_title ?? null,
  };
}
export type OrgRow = { id: string; name: string; legal_name: string | null; cui: string | null; email: string | null; phone: string | null; material_website: string | null; logo_path: string | null; logo_url: string | null; registered_address: string | null; city: string | null; county: string | null };
export function mapPartnerAgency(o: OrgRow, activatedAt: string | null, baseUrl = CRM_URL) {
  return {
    id: o.id, name: o.name, legal_name: o.legal_name, cui: o.cui, email: o.email, phone: o.phone, website: o.material_website,
    logo_url: agencyLogoFeedUrl(o.id, Boolean(o.logo_path || o.logo_url), baseUrl), address: o.registered_address,
    city: o.city, county: o.county, activated_at: activatedAt, status: "active" as const,
  };
}

/** Deterministic JSON for content hashing. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}

export type ListingStateRow = { property_id: string; organization_id: string; agent_id: string | null; content_hash: string; visible: boolean; payload: PartnerListing };
export type ListingChange = { property_id: string; organization_id: string; agent_id: string | null; content_hash: string; visible: boolean; payload: PartnerListing };
/** Upserts for new/changed visible listings, withdrawals for previously visible ones that left the eligible set. */
export function diffListings(previous: ListingStateRow[], current: PartnerListing[], hash: (v: string) => string): ListingChange[] {
  const prev = new Map(previous.map(r => [r.property_id, r])); const seen = new Set<string>(); const out: ListingChange[] = [];
  for (const listing of current) {
    seen.add(listing.id);
    const content_hash = hash(stableJson(listing)); const old = prev.get(listing.id);
    if (old && old.visible && old.content_hash === content_hash) continue;
    out.push({ property_id: listing.id, organization_id: listing.agency_id, agent_id: listing.agent_id, content_hash, visible: true, payload: listing });
  }
  for (const old of previous) {
    if (!old.visible || seen.has(old.property_id)) continue;
    const payload = withdrawnTombstone(old.payload);
    out.push({ property_id: old.property_id, organization_id: old.organization_id, agent_id: old.agent_id, content_hash: hash(stableJson(payload)), visible: false, payload });
  }
  return out;
}
export type AgentStateRow = { agent_id: string; organization_id: string; content_hash: string };
export type AgentChange = { agent_id: string; organization_id: string; content_hash: string | null; payload: PartnerAgent | null; deleted: boolean };
export function diffAgents(previous: AgentStateRow[], current: PartnerAgent[], hash: (v: string) => string): AgentChange[] {
  const prev = new Map(previous.map(r => [r.agent_id, r])); const seen = new Set<string>(); const out: AgentChange[] = [];
  for (const a of current) {
    seen.add(a.id); const content_hash = hash(stableJson(a));
    if (prev.get(a.id)?.content_hash === content_hash) continue;
    out.push({ agent_id: a.id, organization_id: a.agency_id, content_hash, payload: a, deleted: false });
  }
  for (const old of previous) if (!seen.has(old.agent_id)) out.push({ agent_id: old.agent_id, organization_id: old.organization_id, content_hash: null, payload: null, deleted: true });
  return out;
}

/** Opaque cursors (base64url JSON). */
export function encodeCursor(value: Record<string, unknown>): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function decodeCursor(raw: string): Record<string, unknown> | null {
  try {
    if (!/^[A-Za-z0-9_-]{1,400}$/.test(raw)) return null;
    const v = JSON.parse(atob(raw.replace(/-/g, "+").replace(/_/g, "/")));
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch { return null; }
}
