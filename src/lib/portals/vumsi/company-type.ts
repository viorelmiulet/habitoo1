/**
 * Vumsi: tipul companiei (`company_type`). Agențiile Habitoo sunt `real_estate`.
 * Agențiile noi îl primesc la POST; cele existente printr-un singur PATCH, marcat în
 * `vumsi_accounts.company_type_synced_at`. Dacă nomenclatorul (`reference.company_types`)
 * există și nu conține `real_estate`, câmpul nu se trimite deloc.
 */
import type { VumsiCall } from "./publish";

export const VUMSI_COMPANY_TYPE = "real_estate" as const;
export const VUMSI_COMPANY_TYPE_WARNING = "Tipul agenției nu a putut fi actualizat la Vumsi; se reîncearcă la următoarea salvare.";
export const VUMSI_COMPANY_TYPE_REJECTED = "Vumsi nu mai acceptă tipul real_estate";

/** false doar când nomenclatorul are `company_types` și `real_estate` lipsește. */
export function vumsiAllowsRealEstate(reference: unknown): boolean {
  const ref = reference && typeof reference === "object" ? (reference as Record<string, unknown>) : null;
  const list = ref?.["company_types"];
  if (list === undefined || list === null) return true;
  const values: string[] = [];
  const take = (v: unknown, k?: string) => {
    if (typeof v === "string") values.push(v);
    else if (v && typeof v === "object") for (const f of ["value", "code", "id", "key", "name"]) { const x = (v as Record<string, unknown>)[f]; if (typeof x === "string") values.push(x); }
    if (k) values.push(k);
  };
  if (Array.isArray(list)) list.forEach((v) => take(v));
  else if (typeof list === "object") Object.entries(list as Record<string, unknown>).forEach(([k, v]) => take(v, k));
  else return true;
  return values.includes(VUMSI_COMPANY_TYPE);
}

export async function patchVumsiCompanyType(call: VumsiCall, uuid: string): Promise<boolean> {
  const r = await call<unknown>("PATCH", `/companies/${encodeURIComponent(uuid)}/`, { json: { company_type: VUMSI_COMPANY_TYPE } });
  return r.ok;
}

/** SuperAdmin: PATCH pentru toate agențiile cu uuid și fără sincronizare. */
export async function syncAllVumsiCompanyTypes(
  call: VumsiCall,
  rows: { external_id: string; vumsi_uuid: string | null; company_type_synced_at: string | null }[],
  mark: (externalId: string) => Promise<void>,
) {
  let succeeded = 0;
  let failed = 0;
  for (const r of rows) {
    if (!r.vumsi_uuid || r.company_type_synced_at) continue;
    if (await patchVumsiCompanyType(call, r.vumsi_uuid)) { await mark(r.external_id); succeeded += 1; }
    else failed += 1;
  }
  return { succeeded, failed };
}
