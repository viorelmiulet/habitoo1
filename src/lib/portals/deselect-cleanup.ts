/**
 * Debifare/retragere reușită: eroarea de publicare a acelui portal dispare.
 * O retragere eșuată NU trece pe aici, deci eroarea ei rămâne afișată.
 */
type Query = {
  update: (patch: Record<string, unknown>) => Query;
  delete: () => Query;
  eq: (column: string, value: unknown) => Query;
  in: (column: string, values: unknown[]) => Query;
} & PromiseLike<{ error: { message: string } | null }>;

export type CleanupDb = { from: (table: string) => Query };

export async function clearDeselectedPortalError(
  db: CleanupDb,
  input: { organizationId: string; propertyId: string; portalId: string },
): Promise<void> {
  const scope = (q: Query, portalColumn: string) =>
    q.eq("organization_id", input.organizationId).eq("property_id", input.propertyId).eq(portalColumn, input.portalId);
  const results = await Promise.all([
    scope(db.from("portal_publications").update({ last_error: null, status: "disabled" }), "portal_key").eq("enabled", false),
    scope(db.from("portal_listings").update({ last_error: null }), "portal"),
    scope(db.from("portal_listings").update({ status: "withdrawn" }), "portal").in("status", ["error", "pending"]),
    ...(input.portalId === "imo24"
      ? [db.from("imo24_image_retries").delete().eq("organization_id", input.organizationId).eq("property_id", input.propertyId)]
      : []),
  ]);
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
}

/**
 * Cardul unui portal debifat arată doar statusul. Excepție: retragerea a eșuat
 * și anunțul a rămas online (are încă cod la portal) — eroarea rămâne vizibilă.
 */
export function deselectedErrorHidden(cell: {
  selected: boolean;
  checked: boolean;
  lastError: string | null;
  externalId: string | null;
}): boolean {
  if (cell.selected || cell.checked) return false;
  return !(cell.lastError && cell.externalId);
}
