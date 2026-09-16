/**
 * Maparea taxonomiei Habitoo → `data_properties` Imobiliare.ro (funcții pure).
 *
 * Regulă strictă: mapăm doar unde există corespondent CLAR. Orice valoare fără
 * echivalent documentat nu se trimite și apare ca avertisment în diagnostic —
 * nu inventăm valori și nu trimitem text nemapat în câmpuri enumerate.
 */
import { normalizeRoName } from "@/lib/ro-normalize";

function key(value: string | null | undefined): string {
  return value ? normalizeRoName(value) : "";
}

/**
 * Tip de proprietate → `housing_type`.
 * Habitoo stochează slugurile în engleză (`apartment`, `house`, `commercial`…),
 * dar acceptăm și denumirile românești introduse manual.
 */
const HOUSING_TYPE: Record<string, string> = {
  apartment: "apartment",
  studio: "studio",
  house: "house",
  land: "land",
  commercial: "commercial_space",
  office: "office_space",
  industrial: "industrial_space",
  apartament: "apartment",
  garsoniera: "studio",
  casa: "house",
  vila: "house",
  "casa vila": "house",
  duplex: "house",
  teren: "land",
  spatiu_comercial: "commercial_space",
  "spatiu comercial": "commercial_space",
  birou: "office_space",
  birouri: "office_space",
  hala: "industrial_space",
  depozit: "industrial_space",
  spatiu_industrial: "industrial_space",
};

export function housingTypeFor(propertyType: string | null): string | null {
  return HOUSING_TYPE[key(propertyType)] ?? null;
}

/** Destinația (array). Fără corespondent → rezidențial doar pentru locuințe. */
export function destinationFor(propertyType: string | null): string[] {
  const housing = housingTypeFor(propertyType);
  if (housing === "apartment" || housing === "studio" || housing === "house") {
    return ["residential"];
  }
  if (housing === "office_space") return ["office_space"];
  if (housing === "commercial_space") return ["commercial"];
  return [];
}

/** Compartimentare Habitoo → `compartmentalization_type`. */
const COMPARTMENTALIZATION: Record<string, string> = {
  decomandat: "detached",
  semidecomandat: "semi_detached",
  nedecomandat: "undetached",
  circular: "circular",
  vagon: "wagon",
};

export function compartmentalizationFor(layout: string | null): string | null {
  return COMPARTMENTALIZATION[key(layout)] ?? null;
}

/** Confort Habitoo → `comfort` („1”, „2”, „3”, „lux”). */
const COMFORT: Record<string, string> = {
  lux: "lux",
  "confort 1": "1",
  "confort1": "1",
  "1": "1",
  "confort 2": "2",
  "confort2": "2",
  "2": "2",
  "confort 3": "3",
  "confort3": "3",
  "3": "3",
};

export function comfortFor(comfort: string | null): string | null {
  return COMFORT[key(comfort)] ?? null;
}

/** Structura clădirii → `building_structure`. */
const BUILDING_STRUCTURE: Record<string, string> = {
  caramida: "brick",
  bca: "bca",
  beton: "concrete",
  "beton armat": "reinforced_concrete",
  lemn: "wood",
  metal: "metal",
  prefabricate: "prefabricated",
};

export function buildingStructureFor(value: string | null): string | null {
  return BUILDING_STRUCTURE[key(value)] ?? null;
}

/** Tip clădire → `building_type`. */
const BUILDING_TYPE: Record<string, string> = {
  bloc: "block",
  "bloc de apartamente": "block",
  vila: "villa",
  "casa": "house",
  "imobil de birouri": "office_building",
  ansamblu: "residential_complex",
  "ansamblu rezidential": "residential_complex",
};

export function buildingTypeFor(value: string | null): string | null {
  return BUILDING_TYPE[key(value)] ?? null;
}

/** Stadiu construcție → `construction_stage`. */
const CONSTRUCTION_STAGE: Record<string, string> = {
  finalizat: "completed",
  "in construccie": "under_construction",
  "in construcție": "under_construction",
  "in constructie": "under_construction",
  proiect: "project",
  "in proiect": "project",
};

export function constructionStageFor(value: string | null): string | null {
  return CONSTRUCTION_STAGE[key(value)] ?? null;
}

/** `construction_period` este un interval text; îl derivăm din anul construcției. */
const PERIODS: { from: number; to: number; label: string }[] = [
  { from: 0, to: 1940, label: "<1940" },
  { from: 1941, to: 1976, label: "1941-1976" },
  { from: 1977, to: 1990, label: "1977-1990" },
  { from: 1991, to: 2000, label: "1991-2000" },
  { from: 2001, to: 2010, label: "2001-2010" },
  { from: 2011, to: 9999, label: ">2010" },
];

export function constructionPeriodFor(year: number | null): string | null {
  if (!year || !Number.isFinite(year)) return null;
  return PERIODS.find((period) => year >= period.from && year <= period.to)?.label ?? null;
}

/** Grupurile `amenities_*`: listă de valori text, doar cu corespondent clar. */
export type AmenityGroup =
  | "amenities_general"
  | "amenities_heating"
  | "amenities_conditioning"
  | "amenities_interior_condition"
  | "amenities_thermal_insulation"
  | "amenities_flooring"
  | "amenities_walls"
  | "amenities_utility_spaces"
  | "amenities_kitchen"
  | "amenities_meters"
  | "amenities_real_estate_facilities"
  | "amenities_appliances"
  | "amenities_street_development"
  | "amenities_double_pane_windows"
  | "amenities_shutters"
  | "amenities_blind"
  | "amenities_entrance_door"
  | "amenities_interior_doors"
  | "amenities_furnished";

const HEATING: Record<string, string> = {
  centrala: "own_central_heating",
  "centrala proprie": "own_central_heating",
  "centrala imobil": "building_central_heating",
  termoficare: "district_heating",
  "incalzire pardoseala": "underfloor_heating",
  "pardoseala": "underfloor_heating",
  radiatoare: "radiators",
  "soba": "stove",
  "pompa de caldura": "heat_pump",
};

const COOLING: Record<string, string> = {
  "aer conditionat": "air_conditioning",
  "aer-conditionat": "air_conditioning",
  clima: "air_conditioning",
  ventiloconvectoare: "fan_coil",
  ventilatie: "ventilation",
};

const INTERIOR_CONDITION: Record<string, string> = {
  nou: "new",
  "renovat": "renovated",
  "renovat recent": "recently_renovated",
  "de renovat": "needs_renovation",
  "semifinisat": "semi_finished",
  "nefinisat": "unfinished",
  mobilat: "furnished",
  "luxos": "luxury",
};

const FLOORING: Record<string, string> = {
  parchet: "parquet",
  "parchet laminat": "laminated_parquet",
  gresie: "stoneware",
  marmura: "marble",
  mocheta: "carpet",
  linoleum: "linoleum",
  piatra: "stone",
};

const WALLS: Record<string, string> = {
  vopsea: "paint",
  "vopsea lavabila": "washable_paint",
  tapet: "wallpaper",
  faianta: "tiles",
  var: "lime",
};

const UTILITY_SPACES: Record<string, string> = {
  boxa: "storage_room",
  pivnita: "cellar",
  mansarda: "attic",
  pod: "attic",
  garaj: "garage",
  "spatiu depozitare": "storage_room",
  debara: "pantry",
};

const KITCHEN: Record<string, string> = {
  "bucatarie mobilata": "furnished_kitchen",
  "bucatarie utilata": "equipped_kitchen",
  "bucatarie open space": "open_space_kitchen",
  "open space": "open_space_kitchen",
  "chicineta": "kitchenette",
};

const METERS: Record<string, string> = {
  "contor gaz": "gas_meter",
  "contor apa": "water_meter",
  "contor electricitate": "electricity_meter",
  "contor caldura": "heat_meter",
  "repartitoare": "heat_distributors",
};

const FACILITIES: Record<string, string> = {
  lift: "elevator",
  interfon: "intercom",
  videointerfon: "video_intercom",
  paza: "security",
  supraveghere: "video_surveillance",
  "camere supraveghere": "video_surveillance",
  piscina: "swimming_pool",
  "sala fitness": "gym",
  "loc de joaca": "playground",
  parcare: "parking",
  "acces auto": "car_access",
  "spatiu verde": "green_space",
};

const APPLIANCES: Record<string, string> = {
  frigider: "fridge",
  "masina de spalat": "washing_machine",
  "masina de spalat vase": "dishwasher",
  cuptor: "oven",
  plita: "hob",
  aspirator: "vacuum_cleaner",
  "hota": "hood",
  microunde: "microwave",
  televizor: "tv",
};

const STREET_DEVELOPMENT: Record<string, string> = {
  asfalt: "asphalt",
  "strada asfaltata": "asphalt",
  pavaj: "pavement",
  "iluminat public": "public_lighting",
  canalizare: "sewerage",
  "transport in comun": "public_transport",
};

const INSULATION: Record<string, string> = {
  "izolatie exterioara": "exterior",
  "izolat exterior": "exterior",
  "izolatie interioara": "interior",
  anvelopat: "exterior",
};

const WINDOWS: Record<string, string> = {
  termopan: "pvc",
  "termopan pvc": "pvc",
  "tamplarie pvc": "pvc",
  "tamplarie lemn": "wood",
  "tamplarie aluminiu": "aluminium",
  "geam triplu": "triple_glazed",
};

const SHUTTERS: Record<string, string> = {
  rulouri: "roller_shutters",
  "rulouri exterioare": "exterior_roller_shutters",
  jaluzele: "blinds",
};

const BLINDS: Record<string, string> = {
  jaluzele: "blinds",
  "jaluzele verticale": "vertical_blinds",
  "jaluzele orizontale": "horizontal_blinds",
};

const ENTRANCE_DOOR: Record<string, string> = {
  metalica: "metal",
  "usa metalica": "metal",
  lemn: "wood",
  "usa lemn": "wood",
  antiefractie: "anti_burglary",
};

const INTERIOR_DOORS: Record<string, string> = {
  lemn: "wood",
  mdf: "mdf",
  sticla: "glass",
  pvc: "pvc",
};

const FURNISHED: Record<string, string> = {
  mobilat: "furnished",
  "mobilat complet": "fully_furnished",
  "mobilat parcial": "partially_furnished",
  nemobilat: "unfurnished",
  "utilat": "equipped",
};

const GENERAL: Record<string, string> = {
  balcon: "balcony",
  terasa: "terrace",
  gradina: "garden",
  "vedere panoramica": "panoramic_view",
  "curte": "yard",
  "acces persoane cu dizabilitati": "disabled_access",
};

const GROUPS: Record<AmenityGroup, Record<string, string>> = {
  amenities_general: GENERAL,
  amenities_heating: HEATING,
  amenities_conditioning: COOLING,
  amenities_interior_condition: INTERIOR_CONDITION,
  amenities_thermal_insulation: INSULATION,
  amenities_flooring: FLOORING,
  amenities_walls: WALLS,
  amenities_utility_spaces: UTILITY_SPACES,
  amenities_kitchen: KITCHEN,
  amenities_meters: METERS,
  amenities_real_estate_facilities: FACILITIES,
  amenities_appliances: APPLIANCES,
  amenities_street_development: STREET_DEVELOPMENT,
  amenities_double_pane_windows: WINDOWS,
  amenities_shutters: SHUTTERS,
  amenities_blind: BLINDS,
  amenities_entrance_door: ENTRANCE_DOOR,
  amenities_interior_doors: INTERIOR_DOORS,
  amenities_furnished: FURNISHED,
};

export type AmenityMapping = { values: string[]; unmapped: string[] };

/** Mapează o listă Habitoo într-un grup; ce nu are corespondent e raportat. */
export function mapAmenities(
  group: AmenityGroup,
  values: (string | null)[] | null | undefined,
): AmenityMapping {
  const dictionary = GROUPS[group];
  const out: string[] = [];
  const unmapped: string[] = [];
  for (const raw of values ?? []) {
    const value = (raw ?? "").trim();
    if (!value) continue;
    const mapped = dictionary[key(value)];
    if (mapped) {
      if (!out.includes(mapped)) out.push(mapped);
    } else if (!unmapped.includes(value)) {
      unmapped.push(value);
    }
  }
  return { values: out, unmapped };
}
