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

export const ZONATA_IMAGE_TTL_SECONDS = 24 * 60 * 60;

/** Pozele publicabile, principala prima, semnate într-un singur lot fără redirect. */
export async function loadZonataImages(admin: any, organizationId: string, propertyIds: string[]): Promise<Map<string, ZonataImage[]>> {
  const out = new Map<string, ZonataImage[]>();
  if (propertyIds.length === 0) return out;
  const { data, error } = await admin
      .from("property_images")
      .select("id, property_id, url, storage_path, is_primary, position, include_in_publish, is_confidential")
      .eq("organization_id", organizationId)
      .in("property_id", propertyIds);
  if (error) throw new Error("Fotografiile ZonaTa nu au putut fi încărcate.");
  const rows = ((data ?? []) as any[])
    .filter((i) => i.include_in_publish === true && i.is_confidential !== true)
    .sort((a, b) => (!!a.is_primary === !!b.is_primary ? (a.position ?? 0) - (b.position ?? 0) : a.is_primary ? -1 : 1));
  const paths = [...new Set<string>(rows.map((i) => i.storage_path).filter((p): p is string => typeof p === "string" && p.length > 0))];
  if (paths.length === 0) return out;
  const signed = await admin.storage.from("property-media").createSignedUrls(paths, ZONATA_IMAGE_TTL_SECONDS);
  if (signed.error) throw new Error("Fotografiile ZonaTa nu au putut fi semnate.");
  const urls = new Map<string, string>();
  for (const item of signed.data ?? []) {
    if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
  }
  if (paths.some((path) => !urls.has(path))) throw new Error("Unele fotografii ZonaTa nu au putut fi semnate.");
  for (const i of rows) {
    const url = urls.get(i.storage_path);
    if (!url) continue;
    const list = out.get(i.property_id) ?? [];
    list.push({ url, path: i.storage_path });
    out.set(i.property_id, list);
  }
  return out;
}
