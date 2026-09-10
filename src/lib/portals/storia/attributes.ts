/**
 * Maparea câmpurilor Habitoo → atribute Storia, filtrată prin instantaneul
 * taxonomiei reale (`taxonomy-snapshot.ts`).
 *
 * Reguli:
 *  - un atribut se trimite doar dacă apare în categoria respectivă;
 *  - la `select`/`multiple` valoarea trebuie să fie una din valorile confirmate;
 *  - atributele de tip `multiple` se trimit ca intrări repetate `{urn, value}`,
 *    exact ca în exemplul oficial de publicare;
 *  - nu inventăm URN-uri și nu ghicim echivalențe: ce nu are corespondent
 *    confirmat pur și simplu nu se trimite.
 */
import type { PropertyRow } from "@/lib/site-feed/mapper";
import { storiaAttributeSpec } from "./taxonomy-snapshot";
import { roomsUrn } from "./taxonomy";

export type StoriaAttribute = { urn: string; value: string };

const norm = (v: unknown): string =>
  (v ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(norm).filter(Boolean) : []);

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** Suprafață în m², rotunjită, ca text (tipul `input` din taxonomie). */
function surfaceValue(value: unknown): string | null {
  const n = positive(value);
  return n === null ? null : String(Math.round(n));
}

/** Etajul, ca URN de concept — valorile confirmate în taxonomie. */
export function floorUrn(p: PropertyRow): string | null {
  const label = norm(p.floor_label);
  if (label) {
    if (/mansard/.test(label)) return "urn:concept:garret";
    if (/demisol|subsol/.test(label)) return "urn:concept:cellar";
    if (/parter/.test(label)) return "urn:concept:ground-floor";
    const match = /etaj\s*(\d+)/.exec(label);
    if (match) return floorFromNumber(Number(match[1]));
  }
  if (typeof p.floor === "number" && Number.isInteger(p.floor)) {
    if (p.floor === 0) return "urn:concept:ground-floor";
    if (p.floor < 0) return "urn:concept:cellar";
    return floorFromNumber(p.floor);
  }
  return null;
}

const ORDINAL: Record<number, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
  4: "4th",
  5: "5th",
  6: "6th",
  7: "7th",
  8: "8th",
  9: "9th",
  10: "10th",
};

function floorFromNumber(floor: number): string | null {
  if (!Number.isInteger(floor) || floor < 1) return null;
  if (floor >= 11) return "urn:concept:11th-floor-and-above";
  const ordinal = ORDINAL[floor];
  return ordinal ? `urn:concept:${ordinal}-floor` : null;
}

/** Starea imobilului, tradusă în valorile `status` din taxonomie. */
function statusUrn(p: PropertyRow): string | null {
  const finish = norm(p.finish_state);
  const stage = norm(p.construction_stage);
  if (/necesita renovare/.test(finish)) return "urn:concept:in-renovation";
  if (/semifinisat/.test(finish) || /semifinisat|la rosu|in construc|proiect/.test(stage)) {
    return "urn:concept:to-complete";
  }
  if (/finisat|renovat|buna/.test(finish) || /finalizat|la cheie/.test(stage)) {
    return "urn:concept:ready-to-use";
  }
  return null;
}

function buildingMaterialUrn(p: PropertyRow): string | null {
  const structure = norm(p.building_structure);
  if (!structure) return null;
  if (/caramida/.test(structure)) return "urn:concept:brick";
  if (/bca/.test(structure)) return "urn:concept:cellular-concrete";
  if (/prefabricat/.test(structure)) return "urn:concept:concrete-plate";
  if (/beton/.test(structure)) return "urn:concept:concrete";
  if (/lemn/.test(structure)) return "urn:concept:wood";
  if (/metal|mixta/.test(structure)) return "urn:concept:other";
  return null;
}

function windowsTypeUrn(p: PropertyRow): string | null {
  const windows = list(p.windows);
  if (windows.some((w) => /pvc|termopan/.test(w))) return "urn:concept:plastic";
  if (windows.some((w) => /lemn/.test(w))) return "urn:concept:wooden";
  if (windows.some((w) => /aluminiu/.test(w))) return "urn:concept:aluminium";
  return null;
}

/**
 * Tipul clădirii. Valorile permise diferă per categorie (apartamente: `block`,
 * `house`…; case: `detached`, `residence`…; spații comerciale: `private-house`,
 * `office-building`…), așa că trimitem candidații în ordine de preferință și
 * filtrul final păstrează primul confirmat pentru categoria respectivă.
 */
function buildingTypeUrns(p: PropertyRow): string[] {
  const type = norm(p.building_type);
  const codes: string[] =
    /bloc/.test(type)
      ? ["block"]
      : /vila/.test(type)
        ? ["house", "residence"]
        : /casa/.test(type)
          ? ["house", "private-house", "detached"]
          : /imobil de birouri/.test(type)
            ? ["office-building"]
            : /ansamblu rezidential/.test(type)
              ? ["residence"]
              : [];
  return codes.map((c) => `urn:concept:${c}`);
}

/**
 * Compartimentarea (`urn:concept:house-type` pe categoriile de apartamente).
 * Taxonomia reală acceptă exact `circular`, `detached`, `semidetached`,
 * `undetached` — echivalentul celor patru compartimentări românești.
 * „Vagon" și „Open space" nu au valoare confirmată, deci nu se trimit.
 */
function layoutUrn(p: PropertyRow): string | null {
  const layout = norm(p.layout);
  if (/semidecomandat/.test(layout)) return "urn:concept:semidetached";
  if (/nedecomandat/.test(layout)) return "urn:concept:undetached";
  if (/decomandat/.test(layout)) return "urn:concept:detached";
  if (/circular/.test(layout)) return "urn:concept:circular";
  return null;
}

/** Structura → `structure-type` (hale, garaje). Doar echivalențe confirmate. */
function structureTypeUrn(p: PropertyRow): string | null {
  const structure = norm(p.building_structure);
  if (/caramida/.test(structure)) return "urn:concept:brick";
  if (/lemn/.test(structure)) return "urn:concept:wood";
  if (/metal/.test(structure)) return "urn:concept:steel";
  return null;
}

/** Destinația → `use-types` (spații comerciale, hale). */
function useTypesUrns(p: PropertyRow): string[] {
  const destination = norm(p.destination);
  const out: string[] = [];
  const add = (...codes: string[]) => out.push(...codes.map((c) => `urn:concept:${c}`));
  if (/comercial/.test(destination)) add("retail", "commercial");
  if (/birouri/.test(destination)) add("office");
  if (/industrial/.test(destination)) add("industrial", "manufacturing");
  return out;
}


/** Încălzirea, ca enum de apartament (categoriile comerciale folosesc y/n). */
function heatingSelectUrn(p: PropertyRow): string | null {
  const heating = list(p.heating_systems);
  if (heating.length === 0) return null;
  if (heating.some((h) => /termoficare/.test(h))) return "urn:concept:urban";
  if (heating.some((h) => /centrala imobil/.test(h))) return "urn:concept:boiler-room";
  if (heating.some((h) => /centrala/.test(h))) {
    return list(p.utilities).some((u) => /gaz/.test(u)) ? "urn:concept:gas" : "urn:concept:other";
  }
  if (heating.some((h) => /soba/.test(h))) return "urn:concept:tiled-stove";
  return "urn:concept:other";
}

function heatingTypesUrns(p: PropertyRow): string[] {
  const heating = list(p.heating_systems);
  const out: string[] = [];
  if (heating.some((h) => /termoficare/.test(h))) out.push("urn:concept:urban");
  if (heating.some((h) => /centrala/.test(h)) && list(p.utilities).some((u) => /gaz/.test(u))) {
    out.push("urn:concept:gas");
  }
  if (heating.some((h) => /soba/.test(h))) out.push("urn:concept:stove");
  if (heating.some((h) => /semineu/.test(h))) out.push("urn:concept:fireplace");
  if (heating.some((h) => /pompa de caldura/.test(h))) out.push("urn:concept:heat-pump");
  return out;
}

/** Utilități → `media-types`. Numele valorii diferă per categorie; trimitem
 *  ambele variante candidate și filtrul păstrează doar cea confirmată. */
function mediaTypesUrns(p: PropertyRow): string[] {
  const utilities = list(p.utilities);
  const out: string[] = [];
  const add = (...codes: string[]) => out.push(...codes.map((c) => `urn:concept:${c}`));
  if (utilities.some((u) => /curent electric|trifazic/.test(u))) add("electricity");
  if (utilities.some((u) => /^apa$|puț|put/.test(u))) add("water");
  if (utilities.some((u) => /canalizare/.test(u))) add("sewage");
  if (utilities.some((u) => /gaz/.test(u))) add("gas");
  if (utilities.some((u) => /fosa/.test(u))) add("cesspool");
  if (utilities.some((u) => /telefon/.test(u))) add("phone", "telephone");
  if (utilities.some((u) => /internet|fibra/.test(u))) add("internet");
  if (utilities.some((u) => /catv/.test(u))) add("cable-tv", "cable-television");
  return out;
}

/** Dotări electrocasnice / mobilare → `equipment-types`. */
function equipmentTypesUrns(p: PropertyRow): string[] {
  const appliances = list(p.appliances);
  const furnishing = norm(p.furnishing);
  const kitchen = list(p.kitchen_features);
  const out: string[] = [];
  const add = (code: string) => out.push(`urn:concept:${code}`);
  if (/complet|partial|lux|modern/.test(furnishing) || kitchen.some((k) => /mobilat/.test(k))) {
    add("furniture");
  }
  if (appliances.some((a) => /frigider/.test(a))) add("fridge");
  if (appliances.some((a) => /aragaz|plita/.test(a))) add("stove");
  if (appliances.some((a) => /cuptor/.test(a))) add("oven");
  if (appliances.some((a) => /spalat rufe/.test(a))) add("washing-machine");
  if (appliances.some((a) => /spalat vase/.test(a))) add("dishwasher");
  if (appliances.some((a) => /^tv$/.test(a))) add("tv");
  return out;
}

/** Dotări generale → `extras`. */
function extrasUrns(p: PropertyRow): string[] {
  const amenities = list(p.building_amenities);
  const spaces = list(p.additional_spaces);
  const out: string[] = [];
  const add = (...codes: string[]) => out.push(...codes.map((c) => `urn:concept:${c}`));
  if (amenities.some((a) => /lift/.test(a))) add("lift", "elevator");
  if (p.balcony === true || (positive(p.balconies) ?? 0) > 0) add("balcony");
  if ((positive(p.terraces) ?? 0) > 0 || spaces.some((s) => /terasa/.test(s))) add("terrace");
  if (positive(p.garden_surface) !== null || amenities.some((a) => /gradina/.test(a))) add("garden");
  if (list(p.cooling_systems).some((c) => /aer conditionat/.test(c))) add("air-conditioning");
  if (p.has_basement === true || spaces.some((s) => /boxa|pivnita/.test(s))) add("basement");
  if ((positive(p.garages) ?? 0) > 0 || /garaj/.test(norm(p.parking))) add("garage");
  if (p.open_kitchen === false) add("separate-kitchen");
  if (p.has_attic === true) add("attic");
  if (amenities.some((a) => /piscina/.test(a))) add("pool");
  if (list(p.misc_features).some((m) => /scara interioara/.test(m))) add("two-storey");
  return out;
}

/** Siguranță → `security-types`. */
function securityTypesUrns(p: PropertyRow): string[] {
  const amenities = list(p.building_amenities);
  const misc = list(p.misc_features);
  const out: string[] = [];
  const add = (code: string) => out.push(`urn:concept:${code}`);
  if (misc.some((m) => /alarma/.test(m))) add("alarm");
  if (amenities.some((a) => /interfon/.test(a))) add("entryphone");
  if (amenities.some((a) => /supraveghere video/.test(a))) add("monitoring");
  if (list(p.entry_door).some((d) => /metal/.test(d))) add("anti-burglary-door");
  if (list(p.shutters).length > 0) add("roller-shutters");
  return out;
}

/** Priveliște → `views-types`. */
function viewsTypesUrns(p: PropertyRow): string[] {
  const views = list(p.views);
  const out: string[] = [];
  if (views.some((v) => /lac/.test(v))) out.push("urn:concept:lake-view");
  if (views.some((v) => /mare/.test(v))) out.push("urn:concept:sea-view");
  if (views.some((v) => /munte/.test(v))) out.push("urn:concept:mountain-view");
  if (views.some((v) => /padure/.test(v))) {
    out.push("urn:concept:forest-view", "urn:concept:florest-view");
  }
  return out;
}

/** Amenajarea străzii → `access-types`. */
function accessTypesUrns(p: PropertyRow): string[] {
  const street = list(p.street_arrangement);
  const out: string[] = [];
  if (street.some((s) => /asfaltat/.test(s))) out.push("urn:concept:asphalt");
  if (street.some((s) => /pietruit|betonat/.test(s))) {
    out.push("urn:concept:paved", "urn:concept:paved-access");
  }
  if (street.some((s) => /neamenajat/.test(s))) {
    out.push("urn:concept:unpaved-access", "urn:concept:dirt-access");
  }
  return out;
}

/** Destinația terenului → `terrain-type` (doar echivalențe evidente). */
function terrainTypeUrn(p: PropertyRow): string | null {
  const destination = norm(p.destination);
  if (/agricol/.test(destination)) return "urn:concept:agricultural";
  if (/comercial/.test(destination)) return "urn:concept:commercial";
  if (/rezidential/.test(destination)) return "urn:concept:habitat";
  return null;
}

type Candidate = { urn: string; values: (string | null)[]; single: boolean };

/**
 * Toate atributele pe care le-am putea trimite. Filtrarea finală se face în
 * `storiaAttributesFor`, contra instantaneului categoriei.
 */
function candidates(p: PropertyRow, market: "primary" | "secondary"): Candidate[] {
  const netArea = surfaceValue(
    p.usable_surface ?? p.total_usable_surface ?? p.surface ?? p.built_surface,
  );
  const yesNo = (value: boolean | null | undefined): (string | null)[] =>
    value === true ? ["urn:concept:y", "urn:concept:yes"] : [];

  const single = (urn: string, value: string | null): Candidate => ({
    urn,
    values: [value],
    single: true,
  });
  const many = (urn: string, values: string[]): Candidate => ({ urn, values, single: false });

  return [
    single("urn:concept:net-area-m2", netArea),
    single("urn:concept:terrain-area-m2", surfaceValue(p.land_surface)),
    single("urn:concept:usable-area-m2", surfaceValue(p.usable_surface)),
    single("urn:concept:gross-area-m2", surfaceValue(p.built_surface)),
    single("urn:concept:number-of-rooms", roomsUrn(p.rooms ?? null)),
    single("urn:concept:market", `urn:concept:${market}`),
    single("urn:concept:construction-year", yearValue(p.build_year)),
    single("urn:concept:building-floors", integerValue(p.building_floors)),
    single("urn:concept:number-of-floors", integerValue(p.building_floors)),
    single("urn:concept:floor", floorUrn(p)),
    single("urn:concept:status", statusUrn(p)),
    single("urn:concept:building-material", buildingMaterialUrn(p)),
    single("urn:concept:windows-type", windowsTypeUrn(p)),
    many("urn:concept:building-type", buildingTypeUrns(p)),
    many("urn:concept:type", buildingTypeUrns(p)),
    single("urn:concept:house-type", layoutUrn(p)),
    single("urn:concept:structure-type", structureTypeUrn(p)),
    many("urn:concept:use-types", useTypesUrns(p)),
    single("urn:concept:heating", heatingSelectUrn(p)),
    single("urn:concept:terrain-type", terrainTypeUrn(p)),

    { urn: "urn:concept:heating", values: yesNo(list(p.heating_systems).length > 0), single: true },
    many("urn:concept:heating-types", heatingTypesUrns(p)),
    many("urn:concept:media-types", mediaTypesUrns(p)),
    many("urn:concept:equipment-types", equipmentTypesUrns(p)),
    many("urn:concept:extras", extrasUrns(p)),
    many("urn:concept:security-types", securityTypesUrns(p)),
    many("urn:concept:views-types", viewsTypesUrns(p)),
    many("urn:concept:access-types", accessTypesUrns(p)),
  ];
}

function yearValue(value: unknown): string | null {
  const n = positive(value);
  if (n === null) return null;
  const year = Math.round(n);
  return year >= 1800 && year <= new Date().getFullYear() + 10 ? String(year) : null;
}

function integerValue(value: unknown): string | null {
  const n = positive(value);
  return n === null ? null : String(Math.round(n));
}

/**
 * Atributele efective pentru o categorie: doar cele existente în taxonomia
 * reală, cu valori confirmate. `select` primește o singură valoare,
 * `multiple` primește intrări repetate.
 */
export function storiaAttributesFor(
  p: PropertyRow,
  categoryUrn: string,
  market: "primary" | "secondary",
): StoriaAttribute[] {
  const out: StoriaAttribute[] = [];
  const used = new Set<string>();

  for (const candidate of candidates(p, market)) {
    const spec = storiaAttributeSpec(categoryUrn, candidate.urn);
    if (!spec) continue;
    const values = candidate.values.filter((v): v is string => Boolean(v));
    if (values.length === 0) continue;

    if (spec.type === "input") {
      if (used.has(spec.code)) continue;
      const value = values[0];
      if (!value) continue;
      used.add(spec.code);
      out.push({ urn: spec.code, value });
      continue;
    }

    const allowed = values.filter((v) => spec.values.includes(v));
    if (allowed.length === 0) continue;

    if (spec.type === "select") {
      if (used.has(spec.code)) continue;
      const value = allowed[0];
      if (!value) continue;
      used.add(spec.code);
      out.push({ urn: spec.code, value });
      continue;
    }

    for (const value of allowed) {
      const key = `${spec.code}|${value}`;
      if (used.has(key)) continue;
      used.add(key);
      out.push({ urn: spec.code, value });
    }
  }

  return out;
}
