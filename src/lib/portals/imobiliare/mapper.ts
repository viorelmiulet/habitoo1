/**
 * Construcția obiectului de anunț Imobiliare.ro (funcții pure).
 *
 * Validăm local exact ce cere portalul: titlu ≤ 80 caractere, descriere ≥ 80,
 * `location_id` de zonă, coordonate reale, preț, `custom_reference` valid.
 * Câmpurile fără date reale sunt OMISE (inclusiv cele de energie), nu golite
 * cu valori inventate.
 */
import {
  IMOBILIARE_DESCRIPTION_MIN,
  IMOBILIARE_TITLE_MAX,
  isValidCustomReference,
} from "./config";
import {
  buildingStructureFor,
  buildingTypeFor,
  comfortFor,
  compartmentalizationFor,
  constructionPeriodFor,
  constructionStageFor,
  destinationFor,
  housingTypeFor,
  mapAmenities,
  type AmenityGroup,
} from "./taxonomy";

export type ImobiliareListingInput = {
  customReference: string;
  agentIds: number[];
  categoryApi: number | null;
  locationId: number | null;
  title: string | null;
  description: string | null;
  price: number | null;
  currency: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  imageCount: number;
  /** Portalul cere obligatoriu telefon de contact și număr WhatsApp. */
  phone: string | null;
  whatsappNumber: string | null;


  propertyType: string | null;
  layout: string | null;
  comfort: string | null;
  buildingType: string | null;
  buildingStructure: string | null;
  constructionStage: string | null;
  buildYear: number | null;
  rooms: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  buildingFloors: number | null;
  usableSurface: number | null;
  builtSurface: number | null;
  totalUsableSurface: number | null;
  balconies: number | null;
  terraces: number | null;
  kitchens: number | null;
  garages: number | null;
  parkingSpaces: number | null;
  hasBasement: boolean | null;
  hasSemiBasement: boolean | null;
  hasGroundFloor: boolean | null;
  hasAttic: boolean | null;
  petFriendly: boolean | null;
  exclusive: boolean | null;
  collaboration: boolean | null;
  collaborationCommissionPercent: number | null;
  commission: string | null;

  features: (string | null)[] | null;
  utilities: (string | null)[] | null;
  buildingAmenities: (string | null)[] | null;
  heatingSystems: (string | null)[] | null;
  coolingSystems: (string | null)[] | null;
  heating: string | null;
  finishState: string | null;
  insulation: (string | null)[] | null;
  wallFinishes: (string | null)[] | null;
  floorFinishes: (string | null)[] | null;
  windows: (string | null)[] | null;
  blinds: (string | null)[] | null;
  shutters: (string | null)[] | null;
  entryDoor: (string | null)[] | null;
  interiorDoors: (string | null)[] | null;
  additionalSpaces: (string | null)[] | null;
  kitchenFeatures: (string | null)[] | null;
  metering: (string | null)[] | null;
  appliances: (string | null)[] | null;
  streetArrangement: (string | null)[] | null;
  furnishing: string | null;
};

export type ImobiliareListing = Record<string, unknown> & {
  custom_reference: string;
  location_id: number;
  title: string;
  description: string;
  price: number;
  price_currency: string;
  data_properties: Record<string, unknown>;
};

export type ImobiliareListingBuild =
  | { ok: true; listing: ImobiliareListing; warnings: string[] }
  | { ok: false; reasons: string[]; warnings: string[] };

function positiveInt(value: unknown): number | null {
  const parsed = typeof value === "number" ? Math.round(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeInt(value: unknown): number | null {
  const parsed = typeof value === "number" ? Math.round(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function positiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function text(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  return raw.length > 0 ? raw : null;
}

function put(target: Record<string, unknown>, field: string, value: unknown): void {
  if (value === null || value === undefined) return;
  if (Array.isArray(value) && value.length === 0) return;
  target[field] = value;
}

/** Coordonate reale: 0/0 sau lipsă nu sunt acceptate de portal. */
export function hasRealCoordinates(lat: number | null, lng: number | null): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) > 0.0001 &&
    Math.abs(lng) > 0.0001
  );
}

/** Telefon în format românesc local (07xxxxxxxx), cum îl acceptă portalul. */
export function normalizeRoPhone(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/[^\d]/g, "");
  if (!digits) return null;
  let local = digits;
  if (local.startsWith("0040")) local = local.slice(4);
  else if (local.startsWith("40") && local.length >= 11) local = local.slice(2);
  if (!local.startsWith("0")) local = `0${local}`;
  return /^0\d{9}$/.test(local) ? local : null;
}


export function buildImobiliareListing(input: ImobiliareListingInput): ImobiliareListingBuild {
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (!isValidCustomReference(input.customReference)) {
    reasons.push("Referința anunțului nu respectă formatul cerut de Imobiliare.ro.");
  }
  const title = text(input.title);
  if (!title) reasons.push("Oferta nu are titlu.");
  else if (title.length > IMOBILIARE_TITLE_MAX) {
    reasons.push(
      `Titlul are ${title.length} caractere; Imobiliare.ro acceptă maximum ${IMOBILIARE_TITLE_MAX}.`,
    );
  }
  const description = text(input.description);
  if (!description) reasons.push("Oferta nu are descriere.");
  else if (description.length < IMOBILIARE_DESCRIPTION_MIN) {
    reasons.push(
      `Descrierea are ${description.length} caractere; Imobiliare.ro cere minimum ${IMOBILIARE_DESCRIPTION_MIN}.`,
    );
  }
  const price = positiveInt(input.price);
  if (!price) reasons.push("Oferta nu are preț valid.");
  if (!input.locationId) {
    reasons.push("Oferta nu are o zonă Imobiliare.ro (location_id) identificată.");
  }
  if (!hasRealCoordinates(input.latitude, input.longitude)) {
    reasons.push("Oferta nu are coordonate reale pe hartă.");
  }
  if (input.imageCount < 1) reasons.push("Oferta nu are nicio imagine publicabilă.");
  if (input.agentIds.length === 0) {
    reasons.push("Agentul ofertei nu este încă sincronizat cu Imobiliare.ro.");
  }
  if (!input.categoryApi) {
    reasons.push(
      "Categoria Imobiliare.ro (category_api) nu este cunoscută pentru acest tip de proprietate.",
    );
  }

  if (reasons.length > 0) return { ok: false, reasons, warnings };

  const data: Record<string, unknown> = {};

  put(data, "bathroom_count", positiveInt(input.bathrooms));
  put(data, "bedroom_count", positiveInt(input.bedrooms));
  put(data, "floor_number", nonNegativeInt(input.floor));
  put(data, "number_of_floors", positiveInt(input.buildingFloors));
  put(data, "year_built", positiveInt(input.buildYear));
  put(data, "usable_surface", positiveNumber(input.usableSurface));
  put(data, "built_area", positiveNumber(input.builtSurface));
  put(data, "total_usable_surface", positiveNumber(input.totalUsableSurface));
  put(data, "balcony_count", positiveInt(input.balconies));
  put(data, "closed_balcony_count", positiveInt(input.terraces));
  put(data, "kitchen_count", positiveInt(input.kitchens));
  put(data, "garage_count", positiveInt(input.garages));
  put(data, "parking_space_count", positiveInt(input.parkingSpaces));

  put(data, "comfort", comfortFor(input.comfort));
  put(data, "compartmentalization_type", compartmentalizationFor(input.layout));
  put(data, "housing_type", housingTypeFor(input.propertyType));
  put(data, "building_type", buildingTypeFor(input.buildingType));
  put(data, "building_structure", buildingStructureFor(input.buildingStructure));
  put(data, "construction_period", constructionPeriodFor(input.buildYear));
  put(data, "construction_stage", constructionStageFor(input.constructionStage));
  put(data, "destination", destinationFor(input.propertyType));

  if (typeof input.hasBasement === "boolean") data["basement"] = input.hasBasement;
  if (typeof input.hasSemiBasement === "boolean") data["semi_basement"] = input.hasSemiBasement;
  if (typeof input.hasGroundFloor === "boolean") data["ground_floor"] = input.hasGroundFloor;
  if (typeof input.hasAttic === "boolean") data["attic"] = input.hasAttic;
  if (typeof input.petFriendly === "boolean") data["pets_allowed"] = input.petFriendly;
  if (typeof input.exclusive === "boolean") data["exclusive"] = input.exclusive;

  if (typeof input.collaboration === "boolean") {
    data["collaboration"] = input.collaboration;
    const percent = positiveNumber(input.collaborationCommissionPercent);
    if (input.collaboration && percent) data["collaboration_commission_percentage"] = percent;
  }
  const commission = text(input.commission);
  if (commission) data["seller_commission"] = commission;

  const groups: { group: AmenityGroup; values: (string | null)[] | null }[] = [
    { group: "amenities_general", values: [...(input.features ?? []), ...(input.utilities ?? [])] },
    {
      group: "amenities_heating",
      values: [...(input.heatingSystems ?? []), input.heating ?? null],
    },
    { group: "amenities_conditioning", values: input.coolingSystems },
    { group: "amenities_interior_condition", values: [input.finishState ?? null] },
    { group: "amenities_thermal_insulation", values: input.insulation },
    { group: "amenities_flooring", values: input.floorFinishes },
    { group: "amenities_walls", values: input.wallFinishes },
    { group: "amenities_utility_spaces", values: input.additionalSpaces },
    { group: "amenities_kitchen", values: input.kitchenFeatures },
    { group: "amenities_meters", values: input.metering },
    { group: "amenities_real_estate_facilities", values: input.buildingAmenities },
    { group: "amenities_appliances", values: input.appliances },
    { group: "amenities_street_development", values: input.streetArrangement },
    { group: "amenities_double_pane_windows", values: input.windows },
    { group: "amenities_shutters", values: input.shutters },
    { group: "amenities_blind", values: input.blinds },
    { group: "amenities_entrance_door", values: input.entryDoor },
    { group: "amenities_interior_doors", values: input.interiorDoors },
    { group: "amenities_furnished", values: [input.furnishing ?? null] },
  ];

  const unmapped: string[] = [];
  for (const entry of groups) {
    const mapped = mapAmenities(entry.group, entry.values);
    put(data, entry.group, mapped.values);
    for (const value of mapped.unmapped) {
      if (!unmapped.includes(value)) unmapped.push(value);
    }
  }
  if (unmapped.length) {
    warnings.push(
      `Dotări fără corespondent Imobiliare.ro, netrimise: ${unmapped.slice(0, 10).join(", ")}.`,
    );
  }

  const listing: ImobiliareListing = {
    custom_reference: input.customReference,
    agents: input.agentIds,
    category_api: input.categoryApi as number,
    location_id: input.locationId as number,
    title: title as string,
    description: description as string,
    price: price as number,
    price_currency: (input.currency ?? "EUR").toUpperCase(),
    latitude: input.latitude as number,
    longitude: input.longitude as number,
    data_properties: data,
  };
  const address = text(input.address);
  if (address) listing["address"] = address;

  return { ok: true, listing, warnings };
}
