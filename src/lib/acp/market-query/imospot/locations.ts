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
import type { ImospotParsedNeighborhood } from "./parse";

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
    // Cartierele nu sunt scrise aici: se învață din linkurile publicate de
    // pagina sursei (`learnImospotNeighborhoods`), niciodată ghicite.
    neighborhoods: [],
  },
  sector(1),
  sector(2),
  sector(3),
  sector(4),
  sector(5),
  sector(6),
  // Orașele publicate chiar de sursă pe pagina principală (linkuri
  // `/toate-ofertele-din-<slug>`); niciun slug nu este ghicit.
  { slug: "cluj-napoca", label: "Cluj-Napoca", cityId: null, aliases: ["cluj", "cluj napoca"] },
  { slug: "timisoara", label: "Timișoara", cityId: null, aliases: ["timisoara"] },
  { slug: "brasov", label: "Brașov", cityId: null, aliases: ["brasov"] },
  { slug: "iasi", label: "Iași", cityId: null, aliases: ["iasi"] },
  { slug: "constanta", label: "Constanța", cityId: null, aliases: ["constanta"] },
  { slug: "sibiu", label: "Sibiu", cityId: null, aliases: ["sibiu"] },
  { slug: "oradea", label: "Oradea", cityId: null, aliases: ["oradea"] },
  { slug: "arad", label: "Arad", cityId: null, aliases: ["arad"] },
  { slug: "targu-mures", label: "Târgu Mureș", cityId: null, aliases: ["targu mures", "tirgu mures"] },
  { slug: "satu-mare", label: "Satu Mare", cityId: null, aliases: ["satu mare"] },
  { slug: "selimbar", label: "Șelimbăr", cityId: null, aliases: ["selimbar"] },
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

/**
 * Cartierele învățate din paginile sursei, pe durata procesului. Nu se
 * inventează niciun slug: intră doar ce a publicat pagina ca link
 * `/toate-ofertele-din-<oraș>/<cartier>`.
 */
export function learnImospotNeighborhoods(
  entries: readonly ImospotParsedNeighborhood[],
): number {
  let added = 0;
  for (const entry of entries) {
    const city = IMOSPOT_CITIES.find((c) => c.slug === entry.citySlug);
    if (!city) continue;
    const list = (city.neighborhoods ??= []);
    if (list.some((n) => n.slug === entry.slug)) continue;
    list.push({ slug: entry.slug, label: entry.label, neighborhoodId: null });
    added += 1;
  }
  return added;
}

/** Doar pentru teste: harta revine la starea livrată, fără cartiere învățate. */
export function resetImospotNeighborhoods(): void {
  for (const city of IMOSPOT_CITIES) city.neighborhoods = [];
}

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
