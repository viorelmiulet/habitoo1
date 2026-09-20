import type { ApifyFieldMapping } from "./mapping";
import type { ApifyTarget } from "./run";

export type ApifyJobCriteria = {
  transactionType: "sale" | "rent";
  propertyType: "apartment" | "studio" | "house" | "land" | "commercial" | "office" | "industrial";
  county: string;
  locality: string;
  localitySirutaCode: number;
  zone: string | null;
  maxItems: number;
};

export type PredefinedApifySource = {
  key: string;
  label: string;
  description: string;
  actorId: string;
  fieldMapping: ApifyFieldMapping;
  targets: ApifyTarget[];
  inputTemplate: Record<string, unknown>;
  unitCostUsd: number;
  maxResults: number;
  prospectOrganizationRequired: boolean;
};

const COMMON_MAPPING: ApifyFieldMapping = {
  sourceListingId: ["id", "listingId"],
  url: "url",
  title: "title",
  price: "price",
  currency: "currency",
  usableArea: ["usableSurface", "surface", "area"],
  totalArea: ["builtSurface", "totalArea"],
  rooms: "rooms",
  city: "city",
  county: ["county", "region"],
  neighborhood: ["zone", "district"],
  propertyType: "propertyType",
  transactionType: "transactionType",
  listingDate: ["publishedAt", "createdTime", "createdAt"],
  sellerType: ["sellerType", "isBusiness"],
  images: "images",
};

export const PREDEFINED_APIFY_SOURCES: readonly PredefinedApifySource[] = [
  {
    key: "imobiliare_ro",
    label: "Imobiliare.ro — anunțuri",
    description: "Colectează anunțuri pentru comparații în bazinul de piață.",
    actorId: "swerve/imobiliare-scraper",
    fieldMapping: COMMON_MAPPING,
    targets: ["market_pool"],
    inputTemplate: {
      searchUrl: "https://www.imobiliare.ro/{{transactionSlug}}-{{propertySlug}}/{{localitySlug}}{{zonePath}}",
      maxItems: "{{maxItems}}",
    },
    unitCostUsd: 0.005,
    maxResults: 1000,
    prospectOrganizationRequired: false,
  },
  {
    key: "olx_imobiliare",
    label: "OLX — anunțuri imobiliare",
    description: "Colectează anunțuri publice; persoanele fizice pot deveni prospecți.",
    actorId: "sian.agency/olx-property-scraper",
    fieldMapping: {
      ...COMMON_MAPPING,
      usableArea: ["surface", "area", "usableSurface"],
      listingDate: ["createdTime", "createdAt", "publishedAt"],
      neighborhood: ["district", "zone"],
    },
    targets: ["prospects"],
    inputTemplate: {
      country: "ro",
      category: "imobiliare",
      transaction: "{{transactionType}}",
      propertyType: "{{propertyType}}",
      location: "{{locality}}",
      zone: "{{zone}}",
      maxItems: "{{maxItems}}",
      proxyConfiguration: { useApifyProxy: true },
    },
    unitCostUsd: 0.005,
    maxResults: 1000,
    prospectOrganizationRequired: true,
  },
] as const;

export function getPredefinedApifySource(key: string): PredefinedApifySource | null {
  return PREDEFINED_APIFY_SOURCES.find((source) => source.key === key) ?? null;
}

function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const PROPERTY_SLUGS: Record<ApifyJobCriteria["propertyType"], string> = {
  apartment: "apartamente",
  studio: "garsoniere",
  house: "case-vile",
  land: "terenuri",
  commercial: "spatii-comerciale",
  office: "birouri",
  industrial: "spatii-industriale",
};

function replaceTemplate(value: unknown, values: Record<string, string | number>): unknown {
  if (Array.isArray(value)) return value.map((item) => replaceTemplate(item, values));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        replaceTemplate(child, values),
      ]),
    );
  }
  if (typeof value !== "string") return value;
  const exact = value.match(/^{{([a-zA-Z0-9]+)}}$/);
  if (exact) return values[exact[1]] ?? "";
  return value.replace(/{{([a-zA-Z0-9]+)}}/g, (_, key: string) => String(values[key] ?? ""));
}

export function buildPredefinedApifyInput(
  source: PredefinedApifySource,
  criteria: ApifyJobCriteria,
): Record<string, unknown> {
  const values: Record<string, string | number> = {
    transactionType: criteria.transactionType,
    transactionSlug: criteria.transactionType === "sale" ? "vanzare" : "inchiriere",
    propertyType: criteria.propertyType,
    propertySlug: PROPERTY_SLUGS[criteria.propertyType],
    county: criteria.county,
    locality: criteria.locality,
    localitySlug: slug(criteria.locality),
    zone: criteria.zone ?? "",
    zonePath: criteria.zone ? `/${slug(criteria.zone)}` : "",
    maxItems: criteria.maxItems,
  };
  return replaceTemplate(source.inputTemplate, values) as Record<string, unknown>;
}

export function apifyCriteriaSummary(criteria: ApifyJobCriteria): string {
  return [criteria.transactionType === "sale" ? "Vânzare" : "Închiriere", criteria.propertyType, criteria.locality, criteria.zone]
    .filter(Boolean)
    .join(" · ");
}

export function canShowApifyAdvanced(isSuperadmin: boolean): boolean {
  return isSuperadmin;
}
