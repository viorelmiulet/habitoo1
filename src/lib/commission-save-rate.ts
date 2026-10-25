/** A missing external rate must never prevent saving a manually entered commission. */
export async function resolveCommissionSaveRate(date: string, existing: { transaction_date: string; ron_to_eur_rate: number | null } | undefined, fetchRate: (date: string) => Promise<{ rate: number }>): Promise<number | null> {
  if (existing?.transaction_date === date && existing.ron_to_eur_rate != null) return existing.ron_to_eur_rate;
  try { return (await fetchRate(date)).rate; }
  catch { return null; }
}