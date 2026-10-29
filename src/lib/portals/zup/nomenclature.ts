import { normalizeRoName } from "@/lib/ro-normalize";
export type ZupCharacteristic = { filter_key: string; filter_name: string; filter_type: string; options: unknown[]; conditional_options: unknown; depends_on_filter: string | null; validation_rules: unknown[]; is_required: boolean; is_dependent: boolean };
export type ZupCategory = { id: number; parent_id: number | null; name: string; leaf: boolean; characteristics: ZupCharacteristic[] };
export type ZupLocation = { id: number; county: string; locality: string };
export type ZupCatalogue = { categories: ZupCategory[]; locations: ZupLocation[] };
export const zupName = (v: string | null | undefined) => normalizeRoName(v ?? "").replace(/[^a-z0-9]+/g, " ").trim();
export function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Nomenclatorul ZUP are un format invalid.");
  return v as Record<string, unknown>;
}
export function zupList(body: unknown): unknown[] {
  const rows = object(body)["data"];
  if (!Array.isArray(rows)) throw new Error("ZUP nu a returnat lista așteptată.");
  return rows;
}
function id(v: unknown): number { if (typeof v !== "number" || !Number.isSafeInteger(v) || v <= 0) throw new Error("ID invalid în nomenclatorul ZUP."); return v; }
function text(v: unknown): string { if (typeof v !== "string" || !v.trim()) throw new Error("Nume lipsă în nomenclatorul ZUP."); return v; }
export function parseZupCategories(body: unknown): Omit<ZupCategory, "leaf" | "characteristics">[] {
  const result: Omit<ZupCategory, "leaf" | "characteristics">[] = [];
  const visit = (value: unknown, parent: number | null) => {
    const r = object(value); const key = id(r["id"]);
    result.push({ id: key, parent_id: r["parent_id"] == null ? parent : id(r["parent_id"]), name: text(r["name"]) });
    if (r["children"] !== undefined && !Array.isArray(r["children"])) throw new Error("Subcategorii ZUP invalide.");
    for (const child of (r["children"] ?? []) as unknown[]) visit(child, key);
  };
  for (const row of zupList(body)) visit(row, null);
  if (new Set(result.map(r => r.id)).size !== result.length) throw new Error("Categorii ZUP duplicate.");
  return result;
}
export function realEstateCategories(rows: Omit<ZupCategory, "leaf" | "characteristics">[]): ZupCategory[] {
  const ids = new Set([10]);
  for (let pass = 0; pass < rows.length; pass++) for (const r of rows) if (r.parent_id !== null && ids.has(r.parent_id)) ids.add(r.id);
  if (!rows.some(r => r.id === 10) || ids.size <= 1) throw new Error("ZUP nu a returnat categoriile finale de sub Imobiliare.");
  return rows.filter(r => ids.has(r.id)).map(r => ({ ...r, leaf: !rows.some(c => c.parent_id === r.id), characteristics: [] }));
}
export function parseZupCharacteristics(body: unknown): ZupCharacteristic[] {
  const rows = zupList(body).map(value => {
    const r = object(value);
    if (!["select", "multiselect", "text", "number", "range", "boolean"].includes(String(r["filter_type"])) || !Array.isArray(r["options"]) || !Array.isArray(r["validation_rules"]) || typeof r["is_required"] !== "boolean" || typeof r["is_dependent"] !== "boolean") throw new Error("Caracteristică ZUP invalidă.");
    return { filter_key: text(r["filter_key"]), filter_name: text(r["filter_name"]), filter_type: String(r["filter_type"]), options: r["options"], conditional_options: r["conditional_options"] ?? [], depends_on_filter: r["depends_on_filter"] == null ? null : text(r["depends_on_filter"]), validation_rules: r["validation_rules"], is_required: r["is_required"], is_dependent: r["is_dependent"] };
  });
  if (new Set(rows.map(r => r.filter_key)).size !== rows.length) throw new Error("Caracteristici ZUP duplicate.");
  return rows;
}
export function parseZupLocations(body: unknown): ZupLocation[] {
  if (object(body)["success"] !== true) throw new Error("ZUP nu a confirmat lista localităților.");
  const rows = zupList(body).map(v => { const r = object(v); return { id: id(r["id"]), county: text(r["judet"]), locality: text(r["localitate"]) }; });
  if (!rows.length || new Set(rows.map(r => r.id)).size !== rows.length) throw new Error("Localități ZUP lipsă sau duplicate.");
  return rows;
}
/** Downloads and validates everything before invoking the single persistence boundary. */
export async function downloadZupCatalogue(get: (path: string) => Promise<unknown>): Promise<{ snapshot: ZupCatalogue; raw: Record<string, unknown> }> {
  const raw: Record<string, unknown> = {}; raw.categories = await get("categories");
  const rows = parseZupCategories(raw.categories);
  // Detail responses can supply the immediate children missing from the initial tree.
  const visited = new Set<number>();
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]; if (!row || visited.has(row.id)) continue;
    if (rows.length > 500) throw new Error("Nomenclatorul ZUP depășește limita de categorii.");
    const inEstate = row.id === 10 || realAncestor(row, rows);
    if (!inEstate) continue;
    visited.add(row.id); const path = `categories/${row.id}`; raw[path] = await get(path);
    for (const detail of parseZupCategories(raw[path])) {
      const existing = rows.find(r => r.id === detail.id);
      if (!existing) rows.push({ ...detail, parent_id: detail.parent_id ?? row.id });
      else if (existing.name !== detail.name || (detail.parent_id !== null && existing.parent_id !== detail.parent_id)) throw new Error("Categorii ZUP contradictorii.");
    }
  }
  const categories = realEstateCategories(rows);
  for (const c of categories.filter(c => c.leaf)) {
    const path = `categories/${c.id}/characteristics`; raw[path] = await get(path); c.characteristics = parseZupCharacteristics(raw[path]);
    const requiredPath = `${path}/required`; raw[requiredPath] = await get(requiredPath);
    for (const required of parseZupCharacteristics(raw[requiredPath])) {
      const found = c.characteristics.find(f => f.filter_key === required.filter_key);
      if (!found || !required.is_required) throw new Error("Caracteristici obligatorii ZUP contradictorii.");
      found.is_required = true;
    }
  }
  raw.locations = await get("locations");
  const locations = parseZupLocations(raw.locations);
  return { snapshot: { categories: categories.sort((a,b) => a.id-b.id), locations: locations.sort((a,b) => a.id-b.id) }, raw };
}
function realAncestor(row: { parent_id: number | null }, rows: { id: number; parent_id: number | null }[]) {
  let parent = row.parent_id; const seen = new Set<number>();
  while (parent !== null && !seen.has(parent)) { if (parent === 10) return true; seen.add(parent); parent = rows.find(r => r.id === parent)?.parent_id ?? null; }
  return false;
}