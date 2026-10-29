import { normalizeRoName } from "@/lib/ro-normalize";
import { object } from "./response";
export type OferaParameter = { code: string; type: "number" | "checkbox" | "dropdown" | "text"; label: string; required: boolean; options: Record<string, string> | null };
export type OferaCategory = { id: number; parent_id: number | null; name: string; code: string; path_url: string; depth: number; parameters: OferaParameter[] };
export type OferaPlace = { id: number; name: string; name_normalized: string; county_id?: number; city_id?: number };
export type OferaCatalog = { categories: OferaCategory[]; counties: OferaPlace[]; cities: OferaPlace[]; zones: OferaPlace[] };
export type OferaSyncCount = { read: number; added: number; modified: number; deactivated: number };
export type OferaSyncCounts = Record<keyof OferaCatalog, OferaSyncCount>;
export type OferaChanges = { categoriesAdded: number[]; categoriesRemoved: number[]; categoriesChanged: number[]; parameters: { categoryId: number; code: string; kind: "added" | "removed" | "modified" | "options" }[] };
export function oferaWeeklySyncEnabled(activeAgencyCount: number | null): boolean { return activeAgencyCount !== null && activeAgencyCount > 0; }
function fail(message: string): never { throw new Error(`Nomenclator Ofera invalid: ${message}. Datele existente rămân neschimbate.`); }
const id = (v: unknown): number => typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : fail("identificator");
const name = (v: unknown): string => typeof v === "string" && v.trim() ? v : fail("denumire");
const rows = (v: unknown): unknown[] => Array.isArray(v) && v.length > 0 ? v : fail("listă goală sau format neașteptat");
function unique(values: number[], label: string) { if (new Set(values).size !== values.length) fail(`identificatori duplicați (${label})`); }
export function parseOferaParameters(v: unknown): OferaParameter[] {
  if (!Array.isArray(v)) fail("parametri");
  const result = v.map((value): OferaParameter => {
    const p = object(value);
    if (!p || !["number", "checkbox", "dropdown", "text"].includes(String(p["type"])) || typeof p["required"] !== "boolean") fail("tip parametru");
    const options = p["options"];
    if (options !== null && (!object(options) || Object.values(options as object).some((label) => typeof label !== "string"))) fail("opțiuni parametru");
    return { code: name(p["code"]), label: name(p["label"]), type: p["type"] as OferaParameter["type"], required: p["required"], options: options as Record<string, string> | null };
  });
  if (new Set(result.map((p) => p.code)).size !== result.length) fail("parametri duplicați");
  return result;
}
export function parseOferaCategory(value: unknown): OferaCategory & { children: number[] } {
  const c = object(value);
  if (!c || !Array.isArray(c["children"]) || typeof c["depth"] !== "number" || !Number.isInteger(c["depth"]) || c["depth"] < 1) fail("categorie");
  return { id: id(c["id"]), parent_id: null, name: name(c["name"]), code: name(c["code"]), path_url: name(c["path_url"]), depth: c["depth"], parameters: parseOferaParameters(c["parameters"]), children: c["children"].map(id) };
}
export function parseOferaCategoryIndex(body: unknown) {
  const categories = rows(object(body)?.["results"]).map(parseOferaCategory);
  unique(categories.map((c) => c.id), "categorii");
  if (new Set(categories.map((c) => c.path_url)).size !== categories.length) fail("căi duplicate");
  const byId = new Map(categories.map((c) => [c.id, c]));
  for (const c of categories) for (const childId of c.children) {
    const child = byId.get(childId);
    if (!child || child.parent_id !== null || child.depth !== c.depth + 1 || !child.path_url.startsWith(`${c.path_url}/`)) fail("arbore categorii");
    child.parent_id = c.id;
  }
  const root = categories.find((c) => c.path_url === "imobiliare" && c.parent_id === null);
  if (!root) fail("ramura Imobiliare lipsește");
  const realEstateIds = new Set<number>();
  const visit = (categoryId: number) => {
    if (realEstateIds.has(categoryId)) fail("ciclu în categorii");
    realEstateIds.add(categoryId);
    const c = byId.get(categoryId);
    if (!c) fail("categorie lipsă");
    c.children.forEach(visit);
  };
  visit(root.id);
  return { categories, realEstateIds };
}
export function parseOferaPlaces(body: unknown, kind: "counties" | "cities" | "zones", parentIds?: Set<number>): OferaPlace[] {
  const result = rows(body).map((value): OferaPlace => {
    const p = object(value);
    if (!p) fail(kind);
    const label = name(p["nume"]);
    const row: OferaPlace = { id: id(p["id"]), name: label, name_normalized: normalizeRoName(label) };
    if (!row.name_normalized) fail("denumire normalizată goală");
    if (kind !== "counties") {
      const parent = id(p[kind === "cities" ? "judet_id" : "city_id"]);
      // Ofera publishes 17 zones for city 65531, absent from /cities.
      // Preserve source IDs rather than inventing cities or silently losing zones.
      if (kind === "cities" && !parentIds?.has(parent)) fail(`părinte lipsă (${kind})`);
      if (kind === "cities") row.county_id = parent; else row.city_id = parent;
    }
    return row;
  });
  unique(result.map((p) => p.id), kind);
  return result;
}
export function stableOferaJson(value: unknown): string {
  const sorted = (v: unknown): unknown => Array.isArray(v) ? v.map(sorted) : object(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, sorted(x)])) : v;
  return JSON.stringify(sorted(value));
}