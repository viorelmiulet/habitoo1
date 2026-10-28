/**
 * Nomenclatorul ZonaTa (pur): citire tolerantă a `GET /categories` și
 * `GET /categories/{cat}/{sub}/fields`, plus diferențele față de sincronizarea
 * anterioară. Forma exactă a `/categories` nu e documentată.
 */
export type ZonataFieldType = "select" | "text" | "checkbox" | "radio" | "date";
export type ZonataOption = { value: string; label: string };
export type ZonataField = {
  slug: string;
  label: string;
  type: ZonataFieldType | string;
  required: boolean;
  options: ZonataOption[];
};
export type ZonataSubcategory = {
  category_slug: string;
  category_label: string | null;
  subcategory_slug: string;
  subcategory_label: string | null;
  fields: ZonataField[];
};
export type ZonataCategoryRef = Omit<ZonataSubcategory, "fields">;

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function s(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;
}
function unwrap(body: unknown, keys: string[]): unknown {
  let cur = body;
  for (let i = 0; i < 3; i += 1) {
    const r = rec(cur);
    if (!r) return cur;
    const k = keys.find((key) => key in r);
    if (!k) return cur;
    cur = r[k];
  }
  return cur;
}
/** Listă din array sau din obiect `{slug: {...}}`. */
function asList(v: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(v)) return v.map((x) => rec(x) ?? (s(x) ? { slug: s(x) } : null)).filter(Boolean) as Record<string, unknown>[];
  const r = rec(v);
  if (!r) return [];
  return Object.entries(r).map(([k, x]) => ({ slug: k, ...(rec(x) ?? (s(x) ? { name: s(x) } : {})) }));
}
const slugOf = (r: Record<string, unknown>) => s(r["slug"]) ?? s(r["id"]) ?? s(r["key"]);
const labelOf = (r: Record<string, unknown>) => s(r["name"]) ?? s(r["label"]) ?? s(r["title"]);

export function normalizeZt(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, " ")
    .trim();
}

/** `/categories` → perechi categorie/subcategorie; `onlyRealEstate` păstrează doar imobiliarele. */
export function parseZonataCategories(body: unknown, onlyRealEstate = true): ZonataCategoryRef[] {
  const cats = asList(unwrap(body, ["data", "categories"]));
  const out: ZonataCategoryRef[] = [];
  for (const c of cats) {
    const cat = slugOf(c);
    if (!cat) continue;
    if (onlyRealEstate && !/imobil/.test(normalizeZt(`${cat} ${labelOf(c) ?? ""}`))) continue;
    const subs = asList(c["subcategories"] ?? c["children"] ?? c["subcategorii"]);
    for (const sub of subs) {
      const slug = slugOf(sub);
      if (slug) out.push({ category_slug: cat, category_label: labelOf(c), subcategory_slug: slug, subcategory_label: labelOf(sub) });
    }
  }
  return out;
}

export function parseZonataFields(body: unknown): ZonataField[] {
  return asList(unwrap(body, ["data", "fields"]))
    .map((f): ZonataField | null => {
      const slug = slugOf(f);
      if (!slug) return null;
      const rawOpts = f["options"];
      const options: ZonataOption[] = Array.isArray(rawOpts)
        ? rawOpts
            .map((o) => {
              const r = rec(o);
              const value = r ? (s(r["value"]) ?? s(r["slug"]) ?? s(r["label"])) : s(o);
              const label = r ? (s(r["label"]) ?? s(r["name"]) ?? value) : s(o);
              return value ? { value, label: label ?? value } : null;
            })
            .filter((o): o is ZonataOption => o !== null)
        : rec(rawOpts)
          ? Object.entries(rec(rawOpts)!).map(([value, label]) => ({ value, label: s(label) ?? value }))
          : [];
      return {
        slug,
        label: labelOf(f) ?? slug,
        type: (s(f["type"]) ?? "text").toLowerCase(),
        required: f["required"] === true || f["required"] === 1 || f["required"] === "1",
        options,
      };
    })
    .filter((f): f is ZonataField => f !== null);
}

export type ZonataNomenclatureChanges = {
  added: string[];
  removed: string[];
  fieldsChanged: string[];
};
export type ZonataNomenclatureCounts = { subcategories: number; fields: number };

const key = (x: { category_slug: string; subcategory_slug: string }) => `${x.category_slug}/${x.subcategory_slug}`;
const fieldSig = (f: ZonataField) =>
  JSON.stringify([f.slug, f.type, f.required, f.options.map((o) => o.value).sort()]);

export function diffZonataNomenclature(
  next: ZonataSubcategory[],
  previous: Array<Pick<ZonataSubcategory, "category_slug" | "subcategory_slug" | "fields"> & { active?: boolean }>,
): { counts: ZonataNomenclatureCounts; changes: ZonataNomenclatureChanges } {
  const prev = new Map(previous.filter((p) => p.active !== false).map((p) => [key(p), p]));
  const nextKeys = new Set(next.map(key));
  const changes: ZonataNomenclatureChanges = { added: [], removed: [], fieldsChanged: [] };
  for (const n of next) {
    const p = prev.get(key(n));
    if (!p) changes.added.push(key(n));
    else {
      const a = (p.fields ?? []).map(fieldSig).sort().join("|");
      const b = n.fields.map(fieldSig).sort().join("|");
      if (a !== b) changes.fieldsChanged.push(key(n));
    }
  }
  for (const k of prev.keys()) if (!nextKeys.has(k)) changes.removed.push(k);
  return { counts: { subcategories: next.length, fields: next.reduce((n, x) => n + x.fields.length, 0) }, changes };
}
