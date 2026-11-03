import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { decryptPii, encryptPii } from "./crypto.server";
import { maskCnp } from "./templates";

export async function assertContactIdentityAccess(db: SupabaseClient<Database>, contactId: string) {
  const { data, error } = await db.rpc("can_access_contact_identity", { _contact_id: contactId });
  if (error || data !== true) throw new Error("Nu ai acces la datele de identitate ale acestui client.");
}

export function maskedContactIdentity(row: Database["public"]["Tables"]["contact_identities"]["Row"]) {
  const { cnp_enc, id_series_enc, id_number_enc, ...safe } = row;
  return {
    ...safe,
    cnp: maskCnp(decryptPii(cnp_enc)),
    idSeries: id_series_enc ? "••" : null,
    idNumber: id_number_enc ? "••••" : null,
  };
}

export function encryptedIdentityValues(values: { cnp?: string; idSeries?: string; idNumber?: string }) {
  return { cnp_enc: encryptPii(values.cnp), id_series_enc: encryptPii(values.idSeries), id_number_enc: encryptPii(values.idNumber) };
}

/** Server-only copy: plaintext is used for rendering, never returned to the browser. */
export function identityPartyValues(row: Database["public"]["Tables"]["contact_identities"]["Row"]) {
  return {
    fullName: row.full_name, address: row.address ?? undefined,
    birthDate: row.birth_date ?? undefined, citizenship: row.citizenship ?? undefined,
    idIssuer: row.id_issuer ?? undefined, idIssuedOn: row.id_issued_on ?? undefined,
    cnp: decryptPii(row.cnp_enc) ?? undefined,
    idSeries: decryptPii(row.id_series_enc) ?? undefined,
    idNumber: decryptPii(row.id_number_enc) ?? undefined,
  };
}