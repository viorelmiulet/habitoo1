/**
 * Nomenclatorul de locații Imobiliare.ro (funcții pure).
 *
 * Locațiile vin dintr-un fișier livrat de portal (dump SQL sau CSV) și se
 * importă local ca tabel de referință. NU interogăm API-ul lor pentru locații
 * și nu inventăm zone: dacă nomenclatorul nu e încărcat, publicarea se
 * blochează explicit.
 *
 * `location_id` trimis la creare trebuie să fie strict o zonă (`depth = 3`).
 */
import { normalizeRoName } from "@/lib/ro-normalize";

export type ImobiliareLocationRow = {
  id: number;
  parentId: number | null;
  depth: number;
  name: string;
  /** `is_hidden` din dumpul lor: zonele ascunse rămân valabile, dar nu sunt preferate. */
  hidden?: boolean;
};

export type ImobiliareLocationParse = {
  rows: ImobiliareLocationRow[];
  read: number;
  skipped: number;
};

const ID_KEYS = ["id", "location_id", "idlocatie", "id_locatie"];
const PARENT_KEYS = ["parent_id", "parentid", "id_parinte", "parent"];
const DEPTH_KEYS = ["depth", "level", "nivel"];
const NAME_KEYS = ["name", "nume", "denumire", "title", "label"];
const RO_NAME_KEYS = ["translatable_title", "titles", "titluri"];
const HIDDEN_KEYS = ["is_hidden", "hidden", "ascuns"];
const DELETED_KEYS = ["deleted_at", "sters_la"];

/** Extrage denumirea românească din JSON-ul lor (`{"en": ..., "ro": ...}`). */
export function romanianTitle(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .trim()
    .replace(/^'(.*)'$/s, "$1")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'");
  const match = /"ro"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(cleaned);
  if (!match) return null;
  const value = (match[1] as string).replace(/\\"/g, '"');
  // Dumpul folosește entități HTML numerice pentru diacritice (ex. `Jude&#539;ul`).
  const decoded = value
    .replace(/&#(\d+);/g, (_all, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_all, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&");
  return decoded.trim() || null;
}


function pick(header: string[], keys: string[]): number {
  for (const key of keys) {
    const index = header.findIndex((column) => column === key);
    if (index >= 0) return index;
  }
  return -1;
}

function toInt(value: string | undefined): number | null {
  if (value === undefined) return null;
  const raw = value.trim().replace(/^['"]|['"]$/g, "");
  if (!raw || /^null$/i.test(raw)) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function unquote(value: string | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .replace(/^'(.*)'$/s, "$1")
    .replace(/^"(.*)"$/s, "$1")
    .replace(/''/g, "'")
    .replace(/\\'/g, "'")
    .trim();
}

/** Împarte o linie de valori respectând ghilimelele simple/duble. */
export function splitValues(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i] as string;
    if (quote) {
      if (char === "\\" && i + 1 < line.length) {
        current += char + line[i + 1];
        i += 1;
        continue;
      }
      if (char === quote) {
        if (line[i + 1] === quote) {
          current += char + char;
          i += 1;
          continue;
        }
        quote = null;
        current += char;
        continue;
      }
      current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === ",") {
      out.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  out.push(current);
  return out;
}

type Idx = {
  id: number;
  parent: number;
  depth: number;
  name: number;
  roName: number;
  hidden: number;
  deleted: number;
};

function idxFrom(header: string[]): Idx {
  return {
    id: pick(header, ID_KEYS),
    parent: pick(header, PARENT_KEYS),
    depth: pick(header, DEPTH_KEYS),
    name: pick(header, NAME_KEYS),
    roName: pick(header, RO_NAME_KEYS),
    hidden: pick(header, HIDDEN_KEYS),
    deleted: pick(header, DELETED_KEYS),
  };
}

function isNullish(value: string | undefined): boolean {
  const raw = (value ?? "").trim().replace(/^['"]|['"]$/g, "");
  return !raw || /^null$/i.test(raw);
}

function rowFrom(values: string[], idx: Idx): ImobiliareLocationRow | null {
  // Locațiile șterse la ei nu se importă.
  if (idx.deleted >= 0 && !isNullish(values[idx.deleted])) return null;
  const id = toInt(values[idx.id]);
  const depth = toInt(values[idx.depth]);
  const name =
    (idx.roName >= 0 ? romanianTitle(values[idx.roName]) : null) ?? unquote(values[idx.name]);
  if (id === null || depth === null || !name) return null;
  const hidden = idx.hidden >= 0 ? toInt(values[idx.hidden]) === 1 : false;
  return {
    id,
    parentId: idx.parent >= 0 ? toInt(values[idx.parent]) : null,
    depth,
    name,
    hidden,
  };
}

/** Extrage tuplele `values(...)` dintr-un dump, ignorând parantezele din JSON-uri. */
function sqlTuples(content: string): string[] {
  const tuples: string[] = [];
  const re = /values\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content))) {
    let depth = 1;
    let quote = false;
    let index = match.index + match[0].length;
    const start = index;
    while (index < content.length && depth > 0) {
      const char = content[index] as string;
      if (quote) {
        if (char === "\\") index += 1;
        else if (char === "'") quote = false;
      } else if (char === "'") quote = true;
      else if (char === "(") depth += 1;
      else if (char === ")") depth -= 1;
      index += 1;
    }
    tuples.push(content.slice(start, index - 1));
    re.lastIndex = index;
  }
  return tuples;
}

/**
 * Acceptă atât CSV cu antet, cât și dump SQL (`INSERT INTO ... (cols) VALUES (...);`).
 * Rândurile fără id / depth / nume și cele șterse la portal sunt numărate ca respinse.
 */
export function parseImobiliareLocations(content: string): ImobiliareLocationParse {
  const rows: ImobiliareLocationRow[] = [];
  let read = 0;
  let skipped = 0;
  const seen = new Set<number>();

  const insertMatch = /insert\s+into\s+[^(]*\(([^)]*)\)\s*values/i.exec(content);
  if (insertMatch) {
    const header = splitValues(insertMatch[1] as string).map((column) =>
      column.trim().replace(/[`"'\[\]]/g, "").toLowerCase(),
    );
    const idx = idxFrom(header);
    if (idx.id < 0 || idx.depth < 0 || idx.name < 0) {
      return { rows: [], read: 0, skipped: 0 };
    }
    for (const inner of sqlTuples(content)) {
      const values = splitValues(inner);
      if (values.length < header.length) continue;
      read += 1;
      const row = rowFrom(values, idx);
      if (!row || seen.has(row.id)) {
        skipped += 1;
        continue;
      }
      seen.add(row.id);
      rows.push(row);
    }
    return { rows, read, skipped };
  }

  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { rows: [], read: 0, skipped: 0 };
  const delimiter = (lines[0] as string).includes(";") && !(lines[0] as string).includes(",")
    ? ";"
    : ",";
  const header = (lines[0] as string)
    .split(delimiter)
    .map((column) => column.trim().replace(/^["']|["']$/g, "").toLowerCase());
  const idx = idxFrom(header);
  if (idx.id < 0 || idx.depth < 0 || idx.name < 0) return { rows: [], read: 0, skipped: 0 };

  for (const line of lines.slice(1)) {
    read += 1;
    const values = delimiter === ";" ? line.split(";") : splitValues(line);
    const row = rowFrom(values, idx);
    if (!row || seen.has(row.id)) {
      skipped += 1;
      continue;
    }
    seen.add(row.id);
    rows.push(row);
  }
  return { rows, read, skipped };
}


/** Denormalizează județul și orașul pentru fiecare zonă, urcând prin `parent_id`. */
export function denormalizeLocations(rows: ImobiliareLocationRow[]): {
  id: number;
  parent_id: number | null;
  depth: number;
  name: string;
  name_normalized: string;
  county_name: string | null;
  city_name: string | null;
  county_normalized: string | null;
  city_normalized: string | null;
  is_hidden: boolean;
}[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return rows.map((row) => {
    let county: ImobiliareLocationRow | null = null;
    let city: ImobiliareLocationRow | null = null;
    if (row.depth === 1) county = row;
    if (row.depth === 2) {
      city = row;
      county = row.parentId ? (byId.get(row.parentId) ?? null) : null;
    }
    if (row.depth >= 3) {
      city = row.parentId ? (byId.get(row.parentId) ?? null) : null;
      county = city?.parentId ? (byId.get(city.parentId) ?? null) : null;
    }
    return {
      id: row.id,
      parent_id: row.parentId,
      depth: row.depth,
      name: row.name,
      name_normalized: normalizeRoName(row.name),
      county_name: county?.name ?? null,
      city_name: city?.name ?? null,
      county_normalized: county ? normalizeRoName(county.name) : null,
      city_normalized: city ? normalizeRoName(city.name) : null,
      is_hidden: row.hidden === true,
    };
  });

}

export type LocationCandidate = {
  id: number;
  name: string;
  depth: number;
  cityNormalized: string | null;
  countyNormalized: string | null;
};

export type LocationMatch =
  | { ok: true; locationId: number; name: string; approximate: boolean; note: string }
  | { ok: false; reason: string };

/**
 * Alege zona (`depth = 3`) potrivită pentru o adresă Habitoo.
 * Potrivire exactă pe cartier; altfel prima zonă din același oraș, marcată
 * explicit ca aproximativă. Fără oraș găsit → eșec onest.
 */
export function matchImobiliareLocation(input: {
  county: string | null;
  city: string | null;
  district: string | null;
  candidates: LocationCandidate[];
}): LocationMatch {
  const zones = input.candidates.filter((entry) => entry.depth === 3);
  if (zones.length === 0) {
    return {
      ok: false,
      reason:
        "Nu am găsit nicio zonă Imobiliare.ro pentru orașul ofertei. Verifică orașul sau reîmprospătează nomenclatorul de locații.",
    };
  }
  const district = input.district ? normalizeRoName(input.district) : "";
  if (district) {
    const exact = zones.find((zone) => normalizeRoName(zone.name) === district);
    if (exact) {
      return {
        ok: true,
        locationId: exact.id,
        name: exact.name,
        approximate: false,
        note: `Zonă exactă: ${exact.name}.`,
      };
    }
    const partial = zones.find(
      (zone) =>
        normalizeRoName(zone.name).includes(district) ||
        district.includes(normalizeRoName(zone.name)),
    );
    if (partial) {
      return {
        ok: true,
        locationId: partial.id,
        name: partial.name,
        approximate: true,
        note: `Zonă aproximativă: „${input.district}” a fost potrivită cu „${partial.name}”.`,
      };
    }
  }
  const fallback = zones[0] as LocationCandidate;
  return {
    ok: true,
    locationId: fallback.id,
    name: fallback.name,
    approximate: true,
    note: input.district
      ? `Zonă aproximativă: cartierul „${input.district}” nu există în nomenclatorul Imobiliare.ro; s-a folosit „${fallback.name}”.`
      : `Zonă aproximativă: oferta nu are cartier completat; s-a folosit „${fallback.name}”.`,
  };
}
