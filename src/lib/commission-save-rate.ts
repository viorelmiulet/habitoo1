/** A missing external rate must never prevent saving a manually entered commission. */
export async function resolveCommissionSaveRate(
  date: string,
  existing: { transaction_date: string; ron_to_eur_rate: number | null; rate_source?: string | null } | undefined,
  fetchRate: (date: string) => Promise<{ rate: number; source: "BNR" | "BCE" }>,
): Promise<{ rate: number; source: "BNR" | "BCE" } | null> {
  if (existing?.transaction_date === date && existing.ron_to_eur_rate != null) {
    return { rate: existing.ron_to_eur_rate, source: existing.rate_source === "BCE" ? "BCE" : "BNR" };
  }
  try { return await fetchRate(date); }
  catch { return null; }
}
