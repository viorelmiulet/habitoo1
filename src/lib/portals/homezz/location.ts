import { HOMEZZ_AREA_CENTRAL, HOMEZZ_DIRECTION_AREAS, HOMEZZ_STANDARD_AREAS } from "./standard-areas";

export type HomezzCity = { id: number; name: string; county_code: string; country_code?: string; lat: number | null; lng: number | null };
export type HomezzArea = { id: number; name: string; city_id: number; lat?: number | null; lng?: number | null };
export type HomezzLocationInput = {
  county: string | null | undefined;
  city: string | null | undefined;
  district?: string | null | undefined;
  lat?: number | null | undefined;
  lng?: number | null | undefined;
};
export type HomezzLocationResult =
  | { ok: true; cityId: number; areaId: number; areaSource: "name" | "direction" }
  | { ok: false; reason: string };

export const HOMEZZ_BUCHAREST_CITY_ID = 9812;
export const HOMEZZ_CENTRAL_RADIUS_M = 500;

export function normalizeHomezzName(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[şș]/g, "s")
    .replace(/[ţț]/g, "t")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const COUNTIES: Record<string, string> = {
  alba: "AB", arad: "AR", arges: "AG", bacau: "BC", bihor: "BH", "bistrita nasaud": "BN",
  botosani: "BT", braila: "BR", brasov: "BV", buzau: "BZ", calarasi: "CL", "caras severin": "CS",
  cluj: "CJ", constanta: "CT", covasna: "CV", dambovita: "DB", dolj: "DJ", galati: "GL",
  giurgiu: "GR", gorj: "GJ", harghita: "HR", hunedoara: "HD", ialomita: "IL", iasi: "IS",
  ilfov: "IF", maramures: "MM", mehedinti: "MH", mures: "MS", neamt: "NT", olt: "OT",
  prahova: "PH", salaj: "SJ", "satu mare": "SM", sibiu: "SB", suceava: "SV", teleorman: "TR",
  timis: "TM", tulcea: "TL", valcea: "VL", vaslui: "VS", vrancea: "VN", bucuresti: "B",
};

export function homezzCountyCode(county: string | null | undefined): string | null {
  const n = normalizeHomezzName(county).replace(/^(judetul|jud|municipiul|mun)\s+/, "");
  return COUNTIES[n] ?? null;
}

function isBucharest(input: HomezzLocationInput): boolean {
  if (homezzCountyCode(input.county) === "B") return true;
  const c = normalizeHomezzName(input.city);
  return /^(municipiul )?bucuresti( sector(ul)? \d)?$/.test(c) || /^sector(ul)? \d$/.test(c);
}

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(r(lng2 - lng1)) * Math.cos(r(lat2));
  const x = Math.cos(r(lat1)) * Math.sin(r(lat2)) - Math.sin(r(lat1)) * Math.cos(r(lat2)) * Math.cos(r(lng2 - lng1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function resolveHomezzLocation(
  input: HomezzLocationInput,
  cities: readonly HomezzCity[],
  areas: readonly HomezzArea[],
): HomezzLocationResult {
  let city: HomezzCity | undefined;
  if (isBucharest(input)) {
    city = cities.find((c) => c.id === HOMEZZ_BUCHAREST_CITY_ID) ?? {
      id: HOMEZZ_BUCHAREST_CITY_ID, name: "Bucuresti", county_code: "IF", lat: null, lng: null,
    };
  } else {
    const code = homezzCountyCode(input.county);
    if (!code) return { ok: false, reason: "Județul proprietății nu este recunoscut pentru HomeZZ." };
    const name = normalizeHomezzName(input.city);
    if (!name) return { ok: false, reason: "Completează localitatea proprietății pentru HomeZZ." };
    const matches = cities.filter((c) => c.county_code === code && normalizeHomezzName(c.name) === name);
    if (matches.length === 0) return { ok: false, reason: `Localitatea „${input.city}” nu există în nomenclatorul HomeZZ pentru județul ${input.county}.` };
    if (matches.length > 1) return { ok: false, reason: `Localitatea „${input.city}” apare de mai multe ori în nomenclatorul HomeZZ pentru județul ${input.county}; nu se poate alege automat.` };
    city = matches[0]!;
  }

  const district = normalizeHomezzName(input.district);
  if (district) {
    const own = areas.filter((a) => a.city_id === city.id && normalizeHomezzName(a.name) === district);
    if (own.length === 1) return { ok: true, cityId: city.id, areaId: own[0]!.id, areaSource: "name" };
    const std = HOMEZZ_STANDARD_AREAS.find((a) => normalizeHomezzName(a.name) === district);
    if (own.length === 0 && std) return { ok: true, cityId: city.id, areaId: std.id, areaSource: "name" };
  }

  if (num(input.lat) && num(input.lng) && num(city.lat) && num(city.lng)) {
    if (distanceM(city.lat, city.lng, input.lat, input.lng) < HOMEZZ_CENTRAL_RADIUS_M) {
      return { ok: true, cityId: city.id, areaId: HOMEZZ_AREA_CENTRAL, areaSource: "direction" };
    }
    const idx = Math.floor(((bearingDeg(city.lat, city.lng, input.lat, input.lng) + 22.5) % 360) / 45);
    return { ok: true, cityId: city.id, areaId: HOMEZZ_DIRECTION_AREAS[idx]!, areaSource: "direction" };
  }
  return { ok: false, reason: "HomeZZ cere o zonă; completează cartierul sau poziția pe hartă." };
}
