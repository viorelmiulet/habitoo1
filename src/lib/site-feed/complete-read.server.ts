/** Full inventory reads must never silently fall back to empty/partial data. */
export async function readCompleteRows<T>(query: (from: number, to: number) => PromiseLike<{data: T[] | null; error: {message: string} | null}>): Promise<T[]> {
  const rows: T[] = [];
  const size = 500;
  for (let from = 0; ; from += size) {
    const result = await query(from, from + size - 1);
    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new Error("Inventory read returned no data");
    rows.push(...result.data);
    if (result.data.length < size) return rows;
  }
}
export function incompleteFeedResponse(): Response {
  return new Response("Service unavailable. Nu retrageți anunțuri după un răspuns care nu e 200 complet.", {
    status: 503, headers: {"Retry-After": "300", "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8"},
  });
}
type ImageQueryDb = { from: (table: "property_images") => any };

/**
 * Imaginile pentru o listă de oferte, citite pe loturi de ID-uri și paginat
 * (ordonat după id), ca limita de 1.000 de rânduri per cerere să nu taie
 * niciodată imagini, oricât de multe are agenția.
 */
export async function readFeedImages<T = any>(
  db: ImageQueryDb,
  organizationId: string,
  propertyIds: string[],
  options: { publishableOnly?: boolean } = {},
): Promise<{ data: T[]; error: null }> {
  const publishableOnly = options.publishableOnly ?? true;
  const rows: T[] = [];
  for (let i = 0; i < propertyIds.length; i += 200) {
    const chunk = propertyIds.slice(i, i + 200);
    rows.push(...await readCompleteRows<T>((from, to) => {
      let q = db.from("property_images").select("*").eq("organization_id", organizationId).in("property_id", chunk);
      if (publishableOnly) q = q.eq("include_in_publish", true).eq("is_confidential", false);
      return q.order("id").range(from, to);
    }));
  }
  return { data: rows, error: null };
}
