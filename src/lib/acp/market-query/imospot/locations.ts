/**
 * Harta localităților Imospot: corespondența dintre localitatea/zona noastră și
 * adresa publică a sursei.
 *
 * Regula este strictă: ce nu este în hartă nu se ghicește. Fără corespondent
 * pentru zonă se coboară la nivelul orașului; fără corespondent pentru oraș nu
 * se face nicio cerere. Identificatorii numerici (`city_id`,
 * `neighborhood_id`) apar doar acolo unde i-am confirmat; altfel rămân goi și
 * nu se trimit.
 */
import { normalizeRoName } from "@/lib/ro-normalize";

export type ImospotNeighborhood = {
  /** Ultimul segment al adresei: `/toate-ofertele-din-<oraș>/<cartier>`. */
  slug: string;
  label: string;
  /** Confirmat doar când îl cunoaștem; altfel nu se trimite. */
  neighborhoodId: number | null;
  /** Numele sub care apare la noi (pe lângă eticheta afișată). */
  aliases?: string[];
};

export type ImospotCity = {
  /** Segmentul din adresă: `/toate-ofertele-din-<slug>`. */
  slug: string;
  label: string;
  cityId: number | null;
  aliases?: string[];
  neighborhoods?: ImospotNeighborhood[];
};

/** Sectoarele Bucureștiului sunt orașe separate la Imospot. */
function sector(index: number): ImospotCity {
  return {
    slug: `sectorul-${index}-bucuresti`,
    label: `Sectorul ${index}, București`,
    cityId: null,
    aliases: [
      `sector ${index}`,
      `sectorul ${index}`,
      `sector ${index} bucuresti`,
      `sectorul ${index} bucuresti`,
      `bucuresti sector ${index}`,
      `bucuresti sectorul ${index}`,
    ],
  };
}

export const IMOSPOT_CITIES: ImospotCity[] = [
  {
    slug: "bucuresti",
    label: "București",
    cityId: null,
    aliases: ["bucuresti", "bucurest", "municipiul bucuresti"],
    // Doar cartierele confirmate pe paginile publice ale sursei.
    neighborhoods: [
      { slug: "militari", label: "Militari", neighborhoodId: null },
      { slug: "domenii", label: "Domenii", neighborhoodId: null },
      { slug: "rahova", label: "Rahova", neighborhoodId: null },
    ],
  },
  sector(1),
  sector(2),
  sector(3),
  sector(4),
  sector(5),
  sector(6),
];

export type ImospotLocation = {
  /** Calea completă, fără parametri: `/toate-ofertele-din-...`. */
  path: string;
  citySlug: string;
  cityLabel: string;
  cityId: number | null;
  neighborhoodSlug: string | null;
  neighborhoodLabel: string | null;
  neighborhoodId: number | null;
  /** `city` când zona cerută nu are corespondent și s-a coborât la oraș. */
  level: "city" | "neighborhood";
  /** `true` când zona cerută nu a fost găsită în hartă. */
  zoneFallback: boolean;
};

function cityByName(value: string | null): ImospotCity | null {
  if (!value) return null;
  const needle = normalizeRoName(value);
  if (needle === "") return null;
  for (const city of IMOSPOT_CITIES) {
    if (normalizeRoName(city.label) === needle) return city;
    if (normalizeRoName(city.slug.replace(/-/g, " ")) === needle) return city;
    for (const alias of city.aliases ?? []) {
      if (normalizeRoName(alias) === needle) return city;
    }
  }
  return null;
}

function neighborhoodByName(
  city: ImospotCity,
  value: string | null,
): ImospotNeighborhood | null {
  if (!value) return null;
  const needle = normalizeRoName(value);
  if (needle === "") return null;
  for (const item of city.neighborhoods ?? []) {
    if (normalizeRoName(item.label) === needle) return item;
    if (normalizeRoName(item.slug.replace(/-/g, " ")) === needle) return item;
    for (const alias of item.aliases ?? []) {
      if (normalizeRoName(alias) === needle) return item;
    }
  }
  return null;
}

/**
 * Localitatea + zona → adresa Imospot. Zona se caută întâi ca sector (orașele
 * separate ale sursei), apoi ca cartier al orașului. Fără corespondent pentru
 * oraș rezultatul este `null` și nu se face nicio cerere.
 */
export function resolveImospotLocation(input: {
  city: string | null;
  zone: string | null;
}): ImospotLocation | null {
  // Un sector poate veni fie ca oraș, fie ca zonă a Bucureștiului.
  const zoneAsCity = cityByName(input.zone);
  const city = cityByName(input.city);
  const chosen = zoneAsCity ?? city;
  if (!chosen) return null;

  if (zoneAsCity) {
    return {
      path: `/toate-ofertele-din-${zoneAsCity.slug}`,
      citySlug: zoneAsCity.slug,
      cityLabel: zoneAsCity.label,
      cityId: zoneAsCity.cityId,
      neighborhoodSlug: null,
      neighborhoodLabel: null,
      neighborhoodId: null,
      level: "city",
      zoneFallback: false,
    };
  }

  const neighborhood = neighborhoodByName(chosen, input.zone);
  if (neighborhood) {
    return {
      path: `/toate-ofertele-din-${chosen.slug}/${neighborhood.slug}`,
      citySlug: chosen.slug,
      cityLabel: chosen.label,
      cityId: chosen.cityId,
      neighborhoodSlug: neighborhood.slug,
      neighborhoodLabel: neighborhood.label,
      neighborhoodId: neighborhood.neighborhoodId,
      level: "neighborhood",
      zoneFallback: false,
    };
  }

  return {
    path: `/toate-ofertele-din-${chosen.slug}`,
    citySlug: chosen.slug,
    cityLabel: chosen.label,
    cityId: chosen.cityId,
    neighborhoodSlug: null,
    neighborhoodLabel: null,
    neighborhoodId: null,
    level: "city",
    zoneFallback: Boolean(input.zone),
  };
}
