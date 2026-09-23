/**
 * Mapper Habitoo → PrimulAnunț.ro (`PrimulAnuntListingDto`).
 *
 * Scris de la zero, pe structura din `./types.ts` (care urmează documentația
 * oficială https://www.primulanunt.ro/api-agentii). Funcție pură: fără rețea,
 * fără DB — generatorul de referință CRM este injectat prin context.
 *
 * Pozele NU fac parte din acest DTO: se încarcă separat (multipart).
 */
import type { PrimulAnuntListingDto, PrimulAnuntPurpose } from "./types";

export type PrimulAnuntMapperProperty = {
  id: string;
  reference: string | null;
  propertyType: string | null;
  transactionKind: string | null;
  title: string | null;
  description: string | null;
  price: number | null;
  currency: string | null;
  salePrice: number | null;
  saleCurrency: string | null;
  rooms: number | null;
  bathrooms: number | null;
  usableSurface: number | null;
  county: string | null;
  city: string | null;
  district: string | null;
  features: string[] | null;
  lat: number | null;
  lng: number | null;
  postalCode: string | null;
  floor: number | null;
  buildingFloors: number | null;
  assignedTo: string | null;
};

export type PrimulAnuntMapperContext = {
  agent: { fullName: string | null; email: string | null; phone: string | null } | null;
  organization: { phone: string | null; materialPhone: string | null } | null;
  /** `next_property_reference()`; necesar doar când oferta nu are `reference`. */
  generateReference?: () => Promise<string>;
};

export type PrimulAnuntMapperResult =
  | { ok: true; dto: PrimulAnuntListingDto; warnings: string[] }
  | { ok: false; reasons: string[] };

function text(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  return raw.length > 0 ? raw : null;
}

function numeric(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function integer(value: number | null | undefined): number | null {
  const n = numeric(value);
  return n === null ? null : Math.round(n);
}

/**
 * Valorile acceptate de portal pentru `property_type` (enum strict, în română
 * fără diacritice), confirmate de validatorul portalului:
 * `apartament | casa | teren | spatiu_comercial | birou | garaj | hala`.
 */
const PRIMULANUNT_PROPERTY_TYPES = [
  "apartament",
  "casa",
  "teren",
  "spatiu_comercial",
  "birou",
  "garaj",
  "hala",
] as const;

const PROPERTY_TYPE_MAP: Record<string, (typeof PRIMULANUNT_PROPERTY_TYPES)[number]> = {
  apartment: "apartament",
  apartament: "apartament",
  studio: "apartament",
  garsoniera: "apartament",
  duplex: "apartament",
  penthouse: "apartament",
  house: "casa",
  casa: "casa",
  villa: "casa",
  vila: "casa",
  land: "teren",
  teren: "teren",
  commercial: "spatiu_comercial",
  spatiu_comercial: "spatiu_comercial",
  office: "birou",
  birou: "birou",
  garage: "garaj",
  garaj: "garaj",
  parking: "garaj",
  industrial: "hala",
  hala: "hala",
  warehouse: "hala",
};

/** Tipul CRM → valoarea din enumerarea portalului; `null` dacă nu are corespondent. */
export function primulAnuntPropertyType(
  propertyType: string | null,
): (typeof PRIMULANUNT_PROPERTY_TYPES)[number] | null {
  const key = (propertyType ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
  return PROPERTY_TYPE_MAP[key] ?? null;
}

/** `purpose`: doar „sale" și „rent" sunt acceptate de portal. */
export function primulAnuntPurpose(transactionKind: string | null): PrimulAnuntPurpose | null {
  const kind = (transactionKind ?? "").trim().toLowerCase();
  if (kind === "sale") return "sale";
  if (kind === "rent") return "rent";
  return null;
}

export async function mapPropertyToPrimulAnunt(
  property: PrimulAnuntMapperProperty,
  context: PrimulAnuntMapperContext,
): Promise<PrimulAnuntMapperResult> {
  const reasons: string[] = [];
  const warnings: string[] = [];

  // external_id: referința CRM; se generează dacă lipsește (nu e motiv de respingere).
  let externalId = text(property.reference);
  if (!externalId) {
    if (!context.generateReference) {
      reasons.push("Oferta nu are referință CRM și nu există un generator de referințe.");
    } else {
      externalId = text(await context.generateReference());
      if (!externalId) reasons.push("Generatorul de referințe CRM nu a returnat o valoare.");
    }
  }

  const purpose = primulAnuntPurpose(property.transactionKind);
  if (!purpose) {
    reasons.push(
      `Tipul tranzacției „${property.transactionKind ?? "lipsă"}" nu este acceptat de PrimulAnunț.ro (acceptate: vânzare, închiriere).`,
    );
  }

  const rawPropertyType = text(property.propertyType);
  const propertyType = primulAnuntPropertyType(rawPropertyType);
  if (!rawPropertyType) reasons.push("Oferta nu are tipul proprietății completat.");
  else if (!propertyType) {
    reasons.push(
      `Tipul proprietății „${rawPropertyType}" nu este acceptat de PrimulAnunț.ro (acceptate: apartament, casă, teren, spațiu comercial, birou, garaj, hală).`,
    );
  }

  const title = text(property.title);
  if (!title) reasons.push("Oferta nu are titlu.");

  const description = text(property.description);
  if (!description) reasons.push("Oferta nu are descriere.");

  // Preț: cel de tranzacție are prioritate, apoi prețul general.
  const rawPrice =
    typeof property.salePrice === "number" && property.salePrice > 0
      ? property.salePrice
      : typeof property.price === "number" && property.price > 0
        ? property.price
        : null;
  const price = rawPrice === null ? null : Math.round(rawPrice);
  if (price === null) reasons.push("Oferta nu are un preț valid.");
  const currency = (text(property.saleCurrency) ?? text(property.currency) ?? "EUR").toUpperCase();

  const county = text(property.county);
  if (!county) reasons.push("Oferta nu are județ completat.");
  const city = text(property.city);
  if (!city) reasons.push("Oferta nu are oraș completat.");

  // Contact: agentul responsabil, cu fallback pe telefonul agenției. Opțional.
  const agent = property.assignedTo ? context.agent : null;
  const agentName = text(agent?.fullName ?? null);
  const agentEmail = text(agent?.email ?? null);
  const agentPhone =
    text(agent?.phone ?? null) ??
    text(context.organization?.phone ?? null) ??
    text(context.organization?.materialPhone ?? null);
  if (!agentPhone && !agentEmail) {
    warnings.push("Oferta nu are date de contact (nici agent, nici telefon de agenție).");
  }

  if (reasons.length > 0) return { ok: false, reasons };

  const rooms = integer(property.rooms);
  const bathrooms = integer(property.bathrooms);
  const surface = numeric(property.usableSurface);
  const area = text(property.district);
  const features = (property.features ?? []).filter(
    (item): item is string => typeof item === "string",
  );
  const lat = numeric(property.lat);
  const lng = numeric(property.lng);
  const postalCode = text(property.postalCode);
  // Portalul validează etajul ca text, nu ca număr.
  const floorNumber = integer(property.floor);
  const floor = floorNumber === null ? null : String(floorNumber);
  const floorsTotal = integer(property.buildingFloors);

  const dto: PrimulAnuntListingDto = {
    external_id: externalId as string,
    title: title as string,
    description: description as string,
    purpose: purpose as PrimulAnuntPurpose,
    property_type: propertyType as string,
    price: price as number,
    currency,
    county: county as string,
    city: city as string,
    is_private: false,
    ...(rooms !== null ? { rooms } : {}),
    ...(bathrooms !== null ? { bathrooms } : {}),
    ...(surface !== null ? { surface_m2: surface } : {}),
    ...(area ? { area } : {}),
    ...(features.length > 0 ? { features } : {}),
    ...(agentName ? { agent_name: agentName } : {}),
    ...(agentPhone ? { agent_phone: agentPhone } : {}),
    ...(agentEmail ? { agent_email: agentEmail } : {}),
    ...(lat !== null && lng !== null
      ? { lat, lng, location_precision: "exact" as const }
      : {}),
    ...(postalCode ? { postal_code: postalCode } : {}),
    ...(floor !== null ? { floor } : {}),
    ...(floorsTotal !== null ? { floors_total: floorsTotal } : {}),
  };

  return { ok: true, dto, warnings };
}
