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