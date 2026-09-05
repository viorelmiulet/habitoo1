// Import idempotent al nomenclatorului oficial SIRUTA (INS, versiunea 2025 / semestrul 1).
// Datele sursă sunt livrate cu aplicația în /data/siruta-2025.csv (derivat 1:1 din fișierul
// publicat pe data.gov.ro), astfel încât crearea unui anunț nu depinde niciodată de un API extern.
// Se rulează exclusiv server-side, cu clientul privilegiat, și poate fi re-rulat fără duplicate.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { normalizeRoName } from "@/lib/ro-normalize";


type Admin = SupabaseClient<Database>;

export const SIRUTA_VERSION = "SIRUTA 2025 (S1)";
export const SIRUTA_SOURCE_URL = "https://data.gov.ro/dataset/fcba1a54-cffd-422c-b3ac-920f63564085";
export const SIRUTA_DATA_PATH = "/data/siruta-2025.csv";

/** Tipurile SIRUTA de nivel 2 (UAT) → tip normalizat folosit în aplicație. */
const UAT_TYPES: Record<number, string> = {
  1: "municipiu", // municipiu reședință de județ
  2: "oras",
  3: "comuna",
  4: "municipiu",
  5: "municipiu", // oraș reședință de județ (tratat ca municipiu în ierarhia INS)
  9: "municipiu", // Municipiul București
};

/** Tipurile SIRUTA de nivel 3 (localitate) → tip normalizat folosit în aplicație. */
const LOCALITY_TYPES: Record<number, string> = {
  6: "sector",
  9: "localitate_componenta",
  10: "localitate_componenta",
  11: "sat",
  17: "localitate_componenta",
  18: "localitate_componenta",
  19: "sat",
  22: "sat",
  23: "sat",
};

export type SirutaRow = {
  niv: number;
  siruta: number;
  name: string;
  postal: string | null;
  jud: number;
  sirsup: number;
  tip: number;
  med: string;
  regiune: number | null;
  nuts: string | null;
};

export type SirutaImportSummary = {
  version: string;
  counties: number;
  uats: number;
  localities: number;
  skipped: number;
  importedAt: string;
};

function parseCsv(text: string): SirutaRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  lines.shift(); // header
  const rows: SirutaRow[] = [];
  for (const line of lines) {
    const cells = splitCsvLine(line);
    if (cells.length < 10) continue;
    rows.push({
      niv: Number(cells[0]),
      siruta: Number(cells[1]),
      name: cells[2].trim(),
      postal: cells[3] && cells[3] !== "0" ? cells[3].trim() : null,
      jud: Number(cells[4]),
      sirsup: Number(cells[5]),
      tip: Number(cells[6]),
      med: cells[7].trim(),
      regiune: cells[8] ? Number(cells[8]) : null,
      nuts: cells[9] ? cells[9].trim() : null,
    });
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function medium(code: string): string | null {
  if (code === "1") return "urban";
  if (code === "3") return "rural";
  return null;
}

async function chunkedUpsert<T extends Record<string, unknown>>(
  admin: Admin,
  table: "ro_counties" | "ro_uats" | "ro_localities",
  rows: T[],
  size = 500,
) {
  for (let i = 0; i < rows.length; i += size) {
    const slice = rows.slice(i, i + size);
    const { error } = await admin
      .from(table)
      .upsert(slice as never, { onConflict: "siruta_code" });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

/** Descarcă fișierul livrat cu aplicația (același origin) și îl parsează. */
export async function loadSirutaRows(origin: string): Promise<SirutaRow[]> {
  const res = await fetch(new URL(SIRUTA_DATA_PATH, origin).toString());
  if (!res.ok) throw new Error(`Nu am putut citi nomenclatorul SIRUTA (${res.status}).`);
  return parseCsv(await res.text());
}

/**
 * Importă/actualizează nomenclatorul. Idempotent: cheia de conflict este codul SIRUTA,
 * deci re-rularea actualizează denumirile fără să creeze duplicate.
 */
export async function importSirutaNomenclature(admin: Admin, origin: string): Promise<SirutaImportSummary> {
  const rows = await loadSirutaRows(origin);
  if (rows.length < 10000) throw new Error("Fișierul SIRUTA pare incomplet; importul a fost oprit.");

  let skipped = 0;

  // 1. Județe (nivel 1)
  const counties = rows
    .filter((r) => r.niv === 1)
    .map((r) => ({
      siruta_code: r.siruta,
      county_code: r.jud,
      name: r.name,
      region_code: r.regiune,
      nuts_code: r.nuts,
      active: true,
    }));
  await chunkedUpsert(admin, "ro_counties", counties);

  const { data: countyRows, error: countyErr } = await admin
    .from("ro_counties")
    .select("id, siruta_code, county_code");
  if (countyErr) throw new Error(countyErr.message);
  const countyByCode = new Map((countyRows ?? []).map((c) => [c.county_code, c]));

  // 2. UAT-uri (nivel 2)
  const uats: Record<string, unknown>[] = [];
  for (const r of rows.filter((x) => x.niv === 2)) {
    const county = countyByCode.get(r.jud);
    const type = UAT_TYPES[r.tip];
    if (!county || !type) {
      skipped += 1;
      continue;
    }
    uats.push({
      siruta_code: r.siruta,
      name: r.name,
      type,
      type_code: r.tip,
      medium: medium(r.med),
      county_id: county.id,
      county_siruta_code: county.siruta_code,
      parent_siruta_code: r.sirsup,
      postal_code: r.postal,
      active: true,
    });
  }
  await chunkedUpsert(admin, "ro_uats", uats);

  const uatIndex = new Map<number, { id: string; siruta_code: number; county_id: string; county_siruta_code: number }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("ro_uats")
      .select("id, siruta_code, county_id, county_siruta_code")
      .order("siruta_code")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const u of data ?? []) uatIndex.set(u.siruta_code, u);
    if (!data || data.length < 1000) break;
  }

  // 3. Localități (nivel 3)
  const localities: Record<string, unknown>[] = [];
  for (const r of rows.filter((x) => x.niv === 3)) {
    const uat = uatIndex.get(r.sirsup);
    const type = LOCALITY_TYPES[r.tip];
    if (!uat || !type) {
      skipped += 1;
      continue;
    }
    localities.push({
      siruta_code: r.siruta,
      name: r.name,
      type,
      type_code: r.tip,
      medium: medium(r.med),
      uat_id: uat.id,
      uat_siruta_code: uat.siruta_code,
      parent_siruta_code: r.sirsup,
      county_id: uat.county_id,
      county_siruta_code: uat.county_siruta_code,
      postal_code: r.postal,
      active: true,
    });
  }
  await chunkedUpsert(admin, "ro_localities", localities);

  const importedAt = new Date().toISOString();
  const { error: metaErr } = await admin.from("ro_nomenclature_meta").upsert(
    {
      id: "siruta",
      version: SIRUTA_VERSION,
      source_url: SIRUTA_SOURCE_URL,
      imported_at: importedAt,
      counties_count: counties.length,
      uats_count: uats.length,
      localities_count: localities.length,
    } as never,
    { onConflict: "id" },
  );
  if (metaErr) throw new Error(metaErr.message);

  return {
    version: SIRUTA_VERSION,
    counties: counties.length,
    uats: uats.length,
    localities: localities.length,
    skipped,
    importedAt,
  };
}

/**
 * Completează codurile SIRUTA pentru anunțurile existente care au doar text.
 * Nu suprascrie valori deja setate și nu modifică textul introdus de agenți.
 */
export async function backfillPropertySiruta(admin: Admin): Promise<{ checked: number; migrated: number }> {
  const { data: props, error } = await admin
    .from("properties")
    .select("id, city, county, county_siruta_code, locality_siruta_code")
    .is("locality_siruta_code", null);
  if (error) throw new Error(error.message);

  let migrated = 0;
  for (const p of props ?? []) {
    if (!p.city) continue;
    const localityName = normalizeRoName(p.city);
    if (!localityName) continue;

    let query = admin
      .from("ro_localities")
      .select("siruta_code, uat_siruta_code, county_siruta_code, ro_counties!inner(normalized_name)")
      .eq("normalized_name", localityName)
      .limit(2);

    const countyName = p.county ? normalizeRoName(p.county) : "";
    if (countyName) query = query.eq("ro_counties.normalized_name", countyName);

    const { data: matches } = await query;
    // Ambiguu (aceeași denumire în județe diferite, fără județ setat) → lăsăm textul neatins.
    if (!matches || matches.length !== 1) continue;
    const match = matches[0];

    const { error: upErr } = await admin
      .from("properties")
      .update({
        locality_siruta_code: match.siruta_code,
        uat_siruta_code: match.uat_siruta_code,
        county_siruta_code: match.county_siruta_code,
      } as never)
      .eq("id", p.id);
    if (!upErr) migrated += 1;
  }

  return { checked: props?.length ?? 0, migrated };
}

