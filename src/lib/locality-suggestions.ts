// Reguli pure pentru sugestiile de localitate din formulare (fără rețea).
import { normalizePostalCode } from "@/lib/company-lookup";
import { normalizeRoName, prettyUatName, titleCaseRo } from "@/lib/ro-normalize";

export type LocalityRow = {
  sirutaCode: number;
  rawName: string;
  type: string;
  uatSirutaCode: number;
  uatName: string;
  uatType: string | null;
  postalCode: string | null;
};

export type LocalitySuggestion = {
  sirutaCode: number;
  name: string;
  type: string;
  uatSirutaCode: number;
  uatName: string;
  postalCode: string | null;
  rank: number;
  search: string;
};

/** „BUCUREŞTI SECTORUL 1” → „Sector 1”; restul cu majusculă doar la început de cuvânt. */
export function displayLocalityName(rawName: string, type: string): string {
  const m = normalizeRoName(rawName).match(/sectorul\s+(\d)/);
  if (type === "sector" && m) return `Sector ${m[1]}`;
  return titleCaseRo(rawName);
}

/** Cod poștal din nomenclator, la 6 cifre (10013 → 010013). */
export function localityPostalCode(raw: string | number | null | undefined): string | null {
  return normalizePostalCode(raw == null ? null : String(raw));
}

/** 0 = sector, 1 = municipiu, 2 = oraș (reședința UAT-ului), 3 = restul. */
function rankOf(row: LocalityRow): number {
  if (row.type === "sector") return 0;
  const isSeat = normalizeRoName(row.rawName) === normalizeRoName(prettyUatName(row.uatName));
  if (isSeat && row.uatType === "municipiu") return 1;
  if (isSeat && (row.uatType === "oras" || row.uatType === "oraș")) return 2;
  return 3;
}

export function toSuggestions(rows: LocalityRow[]): LocalitySuggestion[] {
  return rows
    .map((row) => {
      const name = displayLocalityName(row.rawName, row.type);
      return {
        sirutaCode: row.sirutaCode,
        name,
        type: row.type,
        uatSirutaCode: row.uatSirutaCode,
        uatName: titleCaseRo(prettyUatName(row.uatName)),
        postalCode: localityPostalCode(row.postalCode),
        rank: rankOf(row),
        search: `${normalizeRoName(name)} ${normalizeRoName(row.rawName)}`,
      };
    })
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, "ro"));
}

/** Fără text: primele `limit`; cu text: potrivire fără diacritice, începutul cuvintelor primul. */
export function filterSuggestions(
  list: LocalitySuggestion[],
  term: string,
  limit = 30,
): LocalitySuggestion[] {
  const q = normalizeRoName(term);
  if (!q) return list.slice(0, limit);
  const starts = list.filter((s) => s.search.split(" ").some((w, i, arr) => arr.slice(i).join(" ").startsWith(q)));
  const rest = list.filter((s) => !starts.includes(s) && s.search.includes(q));
  return [...starts, ...rest].slice(0, limit);
}
