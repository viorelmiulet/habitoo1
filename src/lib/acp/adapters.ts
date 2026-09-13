/**
 * Adaptoare ACP: transformă datele existente în formatul neutru folosit de
 * motorul de scoring, fără a copia sau duplica tabelele existente.
 *
 * Etapa 1 acoperă proprietățile proprii și ofertele de piață normalizate.
 * Adaptorul pentru Colaborare și cel pentru portaluri vor fi implementate
 * ulterior, peste aceleași tipuri.
 */
import type { AcpSubject } from "./scoring";
import { pricePerSqm } from "./statistics";

type PropertyLike = {
  property_type?: string | null;
  transaction_kind?: string | null;
  city?: string | null;
  county?: string | null;
  district?: string | null;
  lat?: number | null;
  lng?: number | null;
  rooms?: number | null;
  usable_surface?: number | null;
  surface?: number | null;
  floor?: number | null;
  building_floors?: number | null;
  build_year?: number | null;
  finish_state?: string | null;
  parking_spaces?: number | null;
  parking?: string | null;
  balcony?: boolean | null;
  furnishing?: string | null;
  price?: number | null;
  currency?: string | null;
};

/** Proprietate din Habitoo → subiect ACP. */
export function propertyToSubject(property: PropertyLike): AcpSubject {
  const area = property.usable_surface ?? property.surface ?? null;
  return {
    propertyType: property.property_type ?? null,
    transactionType: property.transaction_kind ?? null,
    city: property.city ?? null,
    county: property.county ?? null,
    district: property.district ?? null,
    neighborhood: property.district ?? null,
    latitude: property.lat ?? null,
    longitude: property.lng ?? null,
    rooms: property.rooms ?? null,
    usableArea: area,
    floor: property.floor ?? null,
    totalFloors: property.building_floors ?? null,
    constructionYear: property.build_year ?? null,
    condition: property.finish_state ?? null,
    parking:
      typeof property.parking_spaces === "number"
        ? property.parking_spaces > 0
        : property.parking
          ? true
          : null,
    balcony: property.balcony ?? null,
    furnished: property.furnishing ? property.furnishing !== "nemobilat" : null,
    price: property.price ?? null,
    currency: property.currency ?? null,
    pricePerSqm: pricePerSqm(property.price, area),
  };
}

type MarketListingLike = {
  property_type?: string | null;
  transaction_type?: string | null;
  city?: string | null;
  county?: string | null;
  district?: string | null;
  neighborhood?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  rooms?: number | null;
  usable_area?: number | null;
  total_area?: number | null;
  floor?: number | null;
  total_floors?: number | null;
  construction_year?: number | null;
  condition?: string | null;
  parking?: boolean | null;
  balcony?: boolean | null;
  furnished?: boolean | null;
  price?: number | null;
  currency?: string | null;
  price_per_sqm?: number | null;
};

/** Ofertă de piață normalizată → subiect ACP. */
export function marketListingToSubject(listing: MarketListingLike): AcpSubject {
  const area = listing.usable_area ?? listing.total_area ?? null;
  return {
    propertyType: listing.property_type ?? null,
    transactionType: listing.transaction_type ?? null,
    city: listing.city ?? null,
    county: listing.county ?? null,
    district: listing.district ?? null,
    neighborhood: listing.neighborhood ?? listing.district ?? null,
    latitude: listing.latitude ?? null,
    longitude: listing.longitude ?? null,
    rooms: listing.rooms ?? null,
    usableArea: area,
    floor: listing.floor ?? null,
    totalFloors: listing.total_floors ?? null,
    constructionYear: listing.construction_year ?? null,
    condition: listing.condition ?? null,
    parking: listing.parking ?? null,
    balcony: listing.balcony ?? null,
    furnished: listing.furnished ?? null,
    price: listing.price ?? null,
    currency: listing.currency ?? null,
    pricePerSqm: listing.price_per_sqm ?? pricePerSqm(listing.price, area),
  };
}
