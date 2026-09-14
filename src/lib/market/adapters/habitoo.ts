/**
 * Sursa internă Habitoo: proprietățile eligibile ale agenției devin oferte de
 * piață pentru ACP.
 *
 * Reguli:
 *  - nu inventăm date: o proprietate fără preț/suprafață/localizare este
 *    respinsă de validarea comună, nu completată cu valori implicite;
 *  - nu expunem date private: proprietar, contacte, note interne, comision;
 *  - identitatea ofertei este `habitoo_internal` + id-ul proprietății, deci
 *    re-rularea actualizează, nu dublează;
 *  - sincronizarea este parțială pe scopul agenției: nu dezactivează ofertele
 *    altor agenții din aceeași sursă.
 */
import type { AdapterContext, AdapterFetchResult, MarketSourceAdapter } from "../adapter";
import { HABITOO_MAPPING } from "../sources";

/** Proprietăți care pot deveni comparabile (fără ciorne și fără arhivate). */
export const HABITOO_ELIGIBLE_STATUSES = [
  "active",
  "reserved",
  "negotiation",
  "sold",
  "rented",
] as const;

/** Ofertele încheiate rămân în pool ca istoric, marcate inactive. */
const INACTIVE_STATUSES = new Set(["sold", "rented", "expired"]);

export type HabitooPropertyRow = {
  id: string;
  title: string | null;
  reference: string | null;
  property_type: string | null;
  transaction_kind: string | null;
  status: string | null;
  city: string | null;
  county: string | null;
  district: string | null;
  neighborhood?: string | null;
  street?: string | null;
  lat: number | null;
  lng: number | null;
  rooms: number | null;
  bathrooms?: number | null;
  usable_surface: number | null;
  surface: number | null;
  floor: number | string | null;
  building_floors: number | null;
  build_year: number | null;
  price: number | null;
  currency: string | null;
  finish_state?: string | null;
  furnishing?: string | null;
  parking?: boolean | null;
  balcony?: boolean | null;
  updated_at?: string | null;
};

/** Traduce un rând `properties` în formatul generic al pipeline-ului de import. */
export function habitooPropertyToRecord(row: HabitooPropertyRow): Record<string, unknown> {
  return {
    sourceListingId: row.id,
    title: row.title,
    propertyType: row.property_type,
    transactionType: row.transaction_kind,
    city: row.city,
    county: row.county,
    district: row.district,
    neighborhood: row.neighborhood ?? null,
    address: row.street ?? null,
    latitude: row.lat,
    longitude: row.lng,
    rooms: row.rooms,
    bathrooms: row.bathrooms ?? null,
    usableArea: row.usable_surface,
    totalArea: row.surface,
    floor: row.floor,
    totalFloors: row.building_floors,
    constructionYear: row.build_year,
    price: row.price,
    currency: row.currency,
    condition: row.finish_state ?? null,
    furnished: row.furnishing ?? null,
    parking: row.parking ?? null,
    balcony: row.balcony ?? null,
    status: INACTIVE_STATUSES.has(String(row.status ?? "")) ? "inactive" : "active",
  };
}

export type HabitooAdapterDeps = {
  /** Numărul proprietăților eligibile ale agenției (pentru testarea conexiunii). */
  countProperties(organizationId: string): Promise<number>;
  /** Proprietățile eligibile ale agenției. */
  loadProperties(organizationId: string): Promise<HabitooPropertyRow[]>;
};

export function createHabitooInternalAdapter(deps: HabitooAdapterDeps): MarketSourceAdapter {
  return {
    getSourceInfo() {
      return {
        id: "habitoo_internal",
        name: "Date interne Habitoo",
        provider: "Habitoo",
        description: "Proprietățile eligibile ale agenției tale, folosite ca bază de comparație.",
        notes: null,
        formats: ["json", "csv"],
        pull: true,
        configured: true,
        orgScoped: true,
      };
    },
    async testConnection(ctx: AdapterContext) {
      if (!ctx.organizationId) {
        return { ok: false, message: "Sursa internă necesită o agenție activă." };
      }
      const count = await deps.countProperties(ctx.organizationId);
      return {
        ok: true,
        message: `Conexiune internă disponibilă: ${count} proprietăți eligibile.`,
      };
    },
    async fetchRecords(ctx: AdapterContext): Promise<AdapterFetchResult> {
      if (!ctx.organizationId) {
        throw new Error("Sursa internă necesită o agenție activă.");
      }
      const rows = await deps.loadProperties(ctx.organizationId);
      return {
        records: rows.map(habitooPropertyToRecord),
        mapping: HABITOO_MAPPING,
        // Parțial: aducem doar proprietățile acestei agenții.
        mode: "partial",
      };
    },
  };
}
