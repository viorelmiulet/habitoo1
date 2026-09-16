/**
 * Cheia de furnizor CRM La Cheie (`lc_crm_…`).
 *
 * Este UNICĂ pentru tot CRM-ul și se citește exclusiv server-side, din secretul
 * `LACHEIE_CRM_API_KEY`. Nu ajunge niciodată în frontend, în jurnal, în audit
 * sau în vreun mesaj de eroare: singurul loc în care apare este headerul
 * `Authorization` al cererii către La Cheie.
 */
import { PortalError } from "../errors";

const SECRET_NAME = "LACHEIE_CRM_API_KEY";
export const LACHEIE_CRM_KEY_PREFIX = "lc_crm_";

function read(): string | null {
  const raw = process.env[SECRET_NAME];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export function hasLaCheieCrmApiKey(): boolean {
  return read() !== null;
}

/** Cheia de furnizor sau o eroare de configurare, fără a expune valoarea. */
export function laCheieCrmApiKey(): string {
  const key = read();
  if (!key) {
    throw new PortalError(
      "CONFIG_ERROR",
      "Cheia de furnizor La Cheie nu este configurată pe server. Adaugă secretul LACHEIE_CRM_API_KEY.",
    );
  }
  if (!key.startsWith(LACHEIE_CRM_KEY_PREFIX)) {
    throw new PortalError(
      "CONFIG_ERROR",
      "Cheia de furnizor La Cheie are un format neașteptat: trebuie să înceapă cu lc_crm_.",
    );
  }
  return key;
}
