/**
 * Imopedia.ro: rezolvarea localizării (REGION_ID / ZONA_ID) din nomenclatorul
 * importat (`imopedia_regions` / `imopedia_areas`). Funcție pură, fără acces la
 * baza de date. Numele nu sunt unice în regiune: se verifică mereu ramura.
 */
import { normalizeRoName } from "@/lib/ro-normalize";

export const IMOPEDIA_BUCHAREST_REGION_ID = 1;
/** Nodul „Ilfov” (depth 1) din regiunea 1; restul regiunii 1 este Bucureștiul. */
export const IMOPEDIA_ILFOV_NODE_ID = 19;

export type ImopediaRegionRow = { id: number; name: string };
export type ImopediaAreaRow = {
  id: number;
  area: string;
  region_id: number;
  parent_id: number | null;
  depth: number;
  usable_in_api: boolean;
};

export type ImopediaLocationInput = {
  county: string | null | undefined;
  city: string | null | undefined;
  neighborhood: string | null | undefined;
};

export type ImopediaLocationResult = {
  regionId: number | null;
  zonaId: number | null;
  zonaText: string | null;
  status: "exact" | "region_only" | "missing";
  reason: string;
};

/** Fără diacritice, cratimă = spațiu, case-insensitive. */
export function imopediaNormalize(value: string | null | undefined): string {
  return normalizeRoName(value ?? "");
}

function stripCountyPrefix(value: string): string {
  return value.replace(/^(judet(ul)?|jud|municipiul)\s+/, "").trim();
}

function clean(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v ? v : null;
}

export function resolveImopediaLocation(
  input: ImopediaLocationInput,
  regions: readonly ImopediaRegionRow[],
  areas: readonly ImopediaAreaRow[],
): ImopediaLocationResult {
  const city = clean(input.city);
  const neighborhood = clean(input.neighborhood);
  const zonaText = neighborhood ?? city;
  const county = stripCountyPrefix(imopediaNormalize(input.county));
  const cityNorm = imopediaNormalize(city);

  const isBucharest = county === "bucuresti" || (!county && cityNorm === "bucuresti");
  const isIlfov = county === "ilfov";

  let regionId: number | null = null;
  if (isBucharest || isIlfov) {
    regionId = IMOPEDIA_BUCHAREST_REGION_ID;
  } else if (county) {
    const hits = regions.filter((r) => imopediaNormalize(r.name) === county);
    if (hits.length === 1) regionId = hits[0].id;
  }
  if (regionId === null) {
    return {
      regionId: null,
      zonaId: null,
      zonaText,
      status: "missing",
      reason: county
        ? `Județul „${input.county}” nu există în nomenclatorul Imopedia.`
        : "Proprietatea nu are județ.",
    };
  }

  const byId = new Map(areas.map((a) => [a.id, a]));
  const inBranch = (a: ImopediaAreaRow, ancestorId: number): boolean => {
    let cur: ImopediaAreaRow | undefined = a;
    for (let guard = 0; cur && guard < 20; guard++) {
      if (cur.id === ancestorId) return true;
      cur = cur.parent_id === null ? undefined : byId.get(cur.parent_id);
    }
    return false;
  };
  const usableLeaves = (name: string, filter: (a: ImopediaAreaRow) => boolean) => {
    const n = imopediaNormalize(name);
    return areas.filter(
      (a) => a.region_id === regionId && a.usable_in_api && imopediaNormalize(a.area) === n && filter(a),
    );
  };
  const regionOnly = (reason: string): ImopediaLocationResult => ({
    regionId,
    zonaId: null,
    zonaText,
    status: "region_only",
    reason,
  });
  const pick = (hits: ImopediaAreaRow[], label: string): ImopediaLocationResult => {
    if (hits.length === 1) {
      return { regionId, zonaId: hits[0].id, zonaText, status: "exact", reason: `Zonă găsită: ${label}.` };
    }
    return regionOnly(
      hits.length === 0
        ? `Nicio zonă utilizabilă pentru „${label}”.`
        : `${hits.length} zone utilizabile cu numele „${label}”; nu se alege una.`,
    );
  };

  if (isBucharest) {
    if (!neighborhood) return regionOnly("Proprietatea din București nu are cartier.");
    return pick(
      usableLeaves(neighborhood, (a) => !inBranch(a, IMOPEDIA_ILFOV_NODE_ID)),
      neighborhood,
    );
  }
  if (isIlfov) {
    if (!city) return regionOnly("Proprietatea din Ilfov nu are localitate.");
    return pick(usableLeaves(city, (a) => inBranch(a, IMOPEDIA_ILFOV_NODE_ID)), city);
  }
  if (!city) return regionOnly("Proprietatea nu are oraș.");
  const cityNodes = areas.filter(
    (a) => a.region_id === regionId && a.depth === 2 && imopediaNormalize(a.area) === cityNorm,
  );
  if (cityNodes.length !== 1) {
    return regionOnly(
      cityNodes.length === 0
        ? `Orașul „${city}” nu există în nomenclatorul Imopedia.`
        : `${cityNodes.length} orașe „${city}” în regiune; nu se alege unul.`,
    );
  }
  if (!neighborhood) return regionOnly("Proprietatea nu are cartier.");
  const cityId = cityNodes[0].id;
  return pick(
    usableLeaves(neighborhood, (a) => a.parent_id === cityId),
    `${city} / ${neighborhood}`,
  );
}
