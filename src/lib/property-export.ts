/** Export CSV pentru lista Proprietăți: logică pură (coloane, CSV, nume fișier, filtrare acces). */
import { OFFER_SITE } from "@/lib/marketing/offer-seo";

export const EXPORT_SYNC_LIMIT = 2000;

export const PROPERTY_EXPORT_HEADERS = [
  "Referință", "Titlu", "Tip proprietate", "Tranzacție", "Preț vânzare", "Monedă vânzare",
  "Preț chirie", "Monedă chirie", "Camere", "Suprafață utilă", "Etaj", "Zonă", "Localitate",
  "Județ", "Stare publicare", "Agent responsabil", "Ansamblu", "Portaluri publicate",
  "Data creării", "Data publicării", "Link public",
] as const;

/** Singurele coloane citite din `properties` (fără proprietar sau note interne). */
export const PROPERTY_EXPORT_SELECT =
  "id,organization_id,assigned_to,reference,title,property_type,transaction_kind,for_rent,price,currency,sale_price,sale_currency,rent_price,rent_currency,rooms,usable_surface,floor,floor_label,district,city,county,publish_status,development_id,created_at,published_at,public_slug";

export type ExportProperty = {
  id: string; organization_id: string; assigned_to: string | null; reference: string | null; title: string | null;
  property_type: string | null; transaction_kind: string | null; for_rent: boolean | null;
  price: number | null; currency: string | null; sale_price: number | null; sale_currency: string | null;
  rent_price: number | null; rent_currency: string | null; rooms: number | null; usable_surface: number | null;
  floor: number | null; floor_label: string | null; district: string | null; city: string | null; county: string | null;
  publish_status: string | null; development_id: string | null; created_at: string | null; published_at: string | null;
  public_slug: string | null;
};
export type ExportContext = {
  agentName: (id: string | null) => string;
  developmentName: (id: string | null) => string;
  portals: (propertyId: string) => string[];
  typeLabel?: (t: string) => string;
};

const TX: Record<string, string> = { sale: "Vânzare", rent: "Închiriere" };
const PUBLISH: Record<string, string> = { published: "Publicat", unpublished: "Nepublicat", draft: "Ciornă" };
const day = (v: string | null) => (v ? v.slice(0, 10) : "");
const num = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

export function exportRow(p: ExportProperty, ctx: ExportContext): string[] {
  const isRent = p.transaction_kind === "rent";
  const salePrice = p.sale_price ?? (isRent ? null : p.price);
  const saleCur = salePrice === null ? "" : (p.sale_currency ?? p.currency ?? "");
  const rentPrice = p.rent_price ?? (isRent ? p.price : null);
  const rentCur = rentPrice === null ? "" : (p.rent_currency ?? p.currency ?? "");
  const tx = isRent ? TX["rent"]! : p.for_rent ? "Vânzare / Închiriere" : TX["sale"]!;
  return [
    p.reference ?? "", p.title ?? "", p.property_type ? (ctx.typeLabel?.(p.property_type) ?? p.property_type) : "", tx,
    num(salePrice), saleCur, num(rentPrice), rentCur, num(p.rooms), num(p.usable_surface),
    p.floor_label ?? num(p.floor), p.district ?? "", p.city ?? "", p.county ?? "",
    PUBLISH[p.publish_status ?? ""] ?? p.publish_status ?? "", ctx.agentName(p.assigned_to),
    p.development_id ? ctx.developmentName(p.development_id) : "", ctx.portals(p.id).join(", "),
    day(p.created_at), day(p.published_at), p.public_slug ? `${OFFER_SITE}/oferta/${p.public_slug}` : "",
  ];
}

const cell = (v: string) => (/[";\r\n]/.test(v) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
/** UTF-8 cu BOM, separator `;`, CRLF – se deschide corect în Excel cu diacritice. */
export function buildPropertyCsv(rows: string[][]): string {
  return "\uFEFF" + [PROPERTY_EXPORT_HEADERS as readonly string[], ...rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}

export function exportFileName(agency: string, date: Date): string {
  const slug = agency.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "agentie";
  return `proprietati-${slug}-${date.toISOString().slice(0, 10)}.csv`;
}

/** A doua barieră după RLS: aceeași agenție; agentul doar pe cele la care e responsabil (sau importate de el). */
export function scopeExportRows<T extends { organization_id: string; assigned_to: string | null; id: string }>(
  rows: T[], s: { orgId: string; userId: string; isAdmin: boolean; importedByMe?: Set<string> },
): T[] {
  return rows.filter((r) => r.organization_id === s.orgId && (s.isAdmin || r.assigned_to === s.userId || Boolean(s.importedByMe?.has(r.id))));
}
