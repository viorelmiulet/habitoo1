/**
 * Cache-ul taxonomiei OLX.ro (Imobiliare) în `portal_taxonomy_cache`.
 * Se descarcă cu tokenul `client_credentials`, DOAR prin GET
 * (`/categories`, `/categories/{id}/attributes`), și se reîmprospătează
 * săptămânal: la citire, dacă e mai vechi de 7 zile.
 */
import {
  OLX_REAL_ESTATE_ROOT,
  OLX_TAXONOMY_PORTAL,
  OLX_TAXONOMY_SITE,
  OLX_TAXONOMY_TTL_MS,
  type OlxCategory,
  type OlxTaxonomy,
} from "./taxonomy";

type RawAttr = {
  code: string;
  label: string;
  validation?: { required?: boolean; numeric?: boolean; allow_multiple_values?: boolean };
  values?: { code: string }[];
};

export async function fetchOlxTaxonomy(fetchImpl: typeof fetch = fetch): Promise<OlxTaxonomy> {
  const { olxAppAccessToken, olxAppGet } = await import("./oauth.server");
  const token = await olxAppAccessToken({ fetch: fetchImpl });
  const all = ((await olxAppGet(token, "/categories", fetchImpl))?.["data"] ?? []) as OlxCategory[];
  const kids = new Map<number, OlxCategory[]>();
  for (const c of all) kids.set(c.parent_id, [...(kids.get(c.parent_id) ?? []), c]);
  const out: OlxTaxonomy = {};
  const root = all.find((c) => c.id === OLX_REAL_ESTATE_ROOT);
  if (root) out[String(root.id)] = { ...root };
  const walk = async (id: number) => {
    for (const c of kids.get(id) ?? []) {
      const entry: OlxCategory = { id: c.id, name: c.name, parent_id: c.parent_id, photos_limit: c.photos_limit, is_leaf: c.is_leaf };
      if (c.is_leaf) {
        const attrs = ((await olxAppGet(token, `/categories/${c.id}/attributes`, fetchImpl))?.["data"] ?? []) as RawAttr[];
        entry.attributes = attrs.map((a) => ({
          code: a.code,
          label: a.label,
          required: a.validation?.required === true,
          numeric: a.validation?.numeric === true,
          multiple: a.validation?.allow_multiple_values === true,
          values: (a.values ?? []).map((v) => v.code),
        }));
      }
      out[String(c.id)] = entry;
      await walk(c.id);
    }
  };
  await walk(OLX_REAL_ESTATE_ROOT);
  if (Object.keys(out).length < 5) throw new Error("Taxonomia OLX Imobiliare a venit goală.");
  return out;
}

export async function refreshOlxTaxonomyCache(): Promise<OlxTaxonomy> {
  const live = await fetchOlxTaxonomy();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("portal_taxonomy_cache").upsert(
    {
      portal: OLX_TAXONOMY_PORTAL,
      site_urn: OLX_TAXONOMY_SITE,
      fetched_at: new Date().toISOString(),
      categories: live as unknown as never,
      discrepancies: {} as never,
    },
    { onConflict: "portal,site_urn" },
  );
  if (error) throw new Error(error.message);
  return live;
}

/** Taxonomia din cache; se reîmprospătează dacă lipsește sau are peste 7 zile. */
export async function loadOlxTaxonomy(): Promise<OlxTaxonomy> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("portal_taxonomy_cache")
    .select("fetched_at, categories")
    .eq("portal", OLX_TAXONOMY_PORTAL)
    .eq("site_urn", OLX_TAXONOMY_SITE)
    .maybeSingle();
  const fresh = data && Date.now() - new Date(data.fetched_at).getTime() < OLX_TAXONOMY_TTL_MS;
  if (fresh) return data.categories as unknown as OlxTaxonomy;
  try {
    return await refreshOlxTaxonomyCache();
  } catch (error) {
    if (data) return data.categories as unknown as OlxTaxonomy;
    throw error;
  }
}
