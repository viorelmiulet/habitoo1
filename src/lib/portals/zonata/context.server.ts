/** ZonaTa: încărcarea nomenclatorului și a pozelor pentru mapper (server-only). */
import type { ZonataSubcategory } from "./nomenclature";
import type { ZonataImage } from "./mapper";

export async function loadZonataNomenclature(admin: any): Promise<ZonataSubcategory[]> {
  const { data } = await admin
    .from("zonata_subcategories")
    .select("category_slug,category_label,subcategory_slug,subcategory_label,fields")
    .eq("active", true);
  return ((data ?? []) as any[]).map((r) => ({ ...r, fields: Array.isArray(r.fields) ? r.fields : [] }));
}

/** Pozele publicabile, în ordinea Habitoo (principala prima), cu URL public. */
export async function loadZonataImages(admin: any, organizationId: string, propertyIds: string[]): Promise<Map<string, ZonataImage[]>> {
  const out = new Map<string, ZonataImage[]>();
  if (propertyIds.length === 0) return out;
  const [{ data }, { CRM_URL }] = await Promise.all([
    admin
      .from("property_images")
      .select("id, property_id, url, storage_path, is_primary, position, include_in_publish, is_confidential")
      .eq("organization_id", organizationId)
      .in("property_id", propertyIds),
    import("@/lib/host"),
  ]);
  const base = CRM_URL.replace(/\/+$/, "");
  const rows = ((data ?? []) as any[])
    .filter((i) => i.include_in_publish === true && i.is_confidential !== true)
    .sort((a, b) => (!!a.is_primary === !!b.is_primary ? (a.position ?? 0) - (b.position ?? 0) : a.is_primary ? -1 : 1));
  for (const i of rows) {
    const list = out.get(i.property_id) ?? [];
    list.push({ url: `${base}/api/public/sites/v1/media/${i.id}`, path: i.storage_path ?? i.url ?? null });
    out.set(i.property_id, list);
  }
  return out;
}
