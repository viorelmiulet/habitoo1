/**
 * Vumsi: construirea snapshot-ului de nomenclatoare (pur, cu un getter injectat).
 * Doar citiri: `GET /reference/`, `GET /categories/?q=` și `GET /categories/{id}/attributes/`.
 */

/** Termenii de căutare pentru categoriile imobiliare (vânzare și închiriere vin din aceleași căutări). */
export const VUMSI_CATEGORY_QUERIES = [
  "apartament",
  "garsoniera",
  "casa",
  "vila",
  "teren",
  "spatiu comercial",
  "birouri",
  "spatiu industrial",
] as const;

export type VumsiCategory = { id: number; name: string; path: string; parent: number | null; query: string };
export type VumsiAttribute = { name: string; label: string | null; type: string | null; required: boolean; choices: Array<{ value: string; label: string }> };
export type VumsiSnapshot = {
  reference: unknown;
  categories: VumsiCategory[];
  attributes: Record<string, { fields: VumsiAttribute[]; raw: unknown }>;
  counts: { categories: number; attributes: number; required: number };
};

export type VumsiGetter = (path: string, query?: Record<string, string | number>) => Promise<{ ok: true; data: unknown } | { ok: false; message: string }>;

const rec = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
const truthy = (v: unknown) => v === true || v === 1 || (typeof v === "string" && /^(true|1|yes)$/i.test(v.trim()));

export function fold(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Lista `{count, results}` sau array simplu → categorii frunză imobiliare. */
export function parseVumsiCategories(body: unknown, query: string): VumsiCategory[] {
  const list = Array.isArray(body) ? body : Array.isArray(rec(body)?.["results"]) ? (rec(body)!["results"] as unknown[]) : [];
  const out: VumsiCategory[] = [];
  for (const item of list) {
    const r = rec(item);
    const id = Number(r?.["id"]);
    const name = str(r?.["name"]);
    if (!r || !Number.isInteger(id) || !name) continue;
    if (!truthy(r["is_leaf"])) continue;
    const path = str(r["name_with_ancestors"]) ?? str(r["path"]) ?? name;
    if (!/imobil/.test(fold(path))) continue;
    out.push({ id, name, path, parent: Number.isInteger(Number(r["parent"])) && r["parent"] !== null ? Number(r["parent"]) : null, query });
  }
  return out;
}

function choicesOf(v: unknown): Array<{ value: string; label: string }> {
  if (Array.isArray(v)) {
    return v.flatMap((c) => {
      if (Array.isArray(c) && c.length >= 1) { const value = str(c[0]); return value ? [{ value, label: str(c[1]) ?? value }] : []; }
      const r = rec(c);
      if (r) { const value = str(r["value"] ?? r["id"] ?? r["key"]); return value ? [{ value, label: str(r["label"] ?? r["name"] ?? r["display_name"]) ?? value }] : []; }
      const value = str(c);
      return value ? [{ value, label: value }] : [];
    });
  }
  const r = rec(v);
  return r ? Object.entries(r).map(([value, label]) => ({ value, label: str(label) ?? value })) : [];
}

/** Definițiile câmpurilor: array, `{fields: [...]}` sau obiect `{nume: {...}}`. */
export function parseVumsiAttributes(body: unknown): VumsiAttribute[] {
  const b = rec(body);
  const src: unknown = Array.isArray(body) ? body : b?.["fields"] ?? b?.["attributes"] ?? rec(b?.["data"])?.["fields"] ?? body;
  const entries: Array<[string | null, unknown]> = Array.isArray(src) ? src.map((x) => [null, x]) : Object.entries(rec(src) ?? {});
  const out: VumsiAttribute[] = [];
  for (const [k, v] of entries) {
    const r = rec(v);
    if (!r) continue;
    const name = str(r["name"] ?? r["key"] ?? r["field"]) ?? k;
    if (!name) continue;
    out.push({
      name,
      label: str(r["label"] ?? r["title"] ?? r["verbose_name"]),
      type: str(r["type"] ?? r["field_type"] ?? r["widget"]),
      required: truthy(r["required"] ?? r["is_required"]),
      choices: choicesOf(r["choices"] ?? r["options"] ?? r["values"] ?? r["enum"]),
    });
  }
  return out;
}

/** Citește tot și întoarce snapshot-ul; orice eroare oprește (nu se salvează parțial). */
export async function buildVumsiSnapshot(get: VumsiGetter): Promise<VumsiSnapshot> {
  const reference = await get("/reference/");
  if (!reference.ok) throw new Error(`Referințe: ${reference.message}`);
  const byId = new Map<number, VumsiCategory>();
  for (const q of VUMSI_CATEGORY_QUERIES) {
    const res = await get("/categories/", { q, limit: 100 });
    if (!res.ok) throw new Error(`Categorii „${q}”: ${res.message}`);
    for (const c of parseVumsiCategories(res.data, q)) if (!byId.has(c.id)) byId.set(c.id, c);
  }
  const categories = [...byId.values()].sort((a, b) => a.id - b.id);
  if (!categories.length) throw new Error("Vumsi nu a întors nicio categorie imobiliară de ultim nivel; snapshot-ul nu a fost salvat.");
  const attributes: VumsiSnapshot["attributes"] = {};
  let total = 0;
  let required = 0;
  for (const c of categories) {
    const res = await get(`/categories/${c.id}/attributes/`);
    if (!res.ok) throw new Error(`${c.name}: ${res.message}`);
    const fields = parseVumsiAttributes(res.data);
    attributes[String(c.id)] = { fields, raw: res.data };
    total += fields.length;
    required += fields.filter((f) => f.required).length;
  }
  return { reference: reference.data, categories, attributes, counts: { categories: categories.length, attributes: total, required } };
}
