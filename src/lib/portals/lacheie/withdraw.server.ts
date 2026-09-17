/**
 * Starea locală după dezactivarea conexiunii La Cheie: ofertele agenției devin
 * „withdrawn” în CRM, fără apeluri suplimentare la portal.
 *
 * Coloane reale: `portal_listings.portal`, `portal_publications.portal_key`;
 * ambele tabele au `updated_by`. Erorile sunt returnate, nu ignorate.
 */
import { LACHEIE_PORTAL_KEY } from "@/lib/portals/lacheie/config";

type UpdateResult = { error: { message: string } | null };

type UpdateBuilder = {
  update: (patch: Record<string, unknown>) => {
    eq: (column: string, value: unknown) => {
      eq: (column: string, value: unknown) => PromiseLike<UpdateResult>;
    };
  };
};

export type WithdrawClient = { from: (table: string) => UpdateBuilder };

export async function markLaCheieListingsWithdrawn(
  client: WithdrawClient,
  organizationId: string,
  actorId: string | null,
): Promise<{ ok: boolean; error: string | null }> {
  /**
   * Motivul retragerii este esențial: doar ofertele retrase de dezactivare se
   * retrimit la reactivare; cele retrase de un om rămân retrase.
   */
  const patch = {
    status: "withdrawn",
    withdraw_reason: LACHEIE_WITHDRAW_REASON.agencyDeactivated,
    updated_by: actorId,
  };
  const [listings, publications] = await Promise.all([
    client
      .from("portal_listings")
      .update(patch)
      .eq("organization_id", organizationId)
      .eq("portal", LACHEIE_PORTAL_KEY),
    client
      .from("portal_publications")
      .update(patch)
      .eq("organization_id", organizationId)
      .eq("portal_key", LACHEIE_PORTAL_KEY),
  ]);

  const failures = [listings.error, publications.error]
    .filter((error) => error !== null)
    .map((error) => error?.message ?? "eroare necunoscută");
  if (failures.length === 0) return { ok: true, error: null };
  return {
    ok: false,
    error: `Conexiunea a fost dezactivată la La Cheie, dar ofertele nu au putut fi marcate local ca retrase: ${failures.join("; ")}`,
  };
}
