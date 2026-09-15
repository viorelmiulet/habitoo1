/**
 * Provider onest pentru surse fără integrare autorizată (Stage 19).
 *
 * Nu face nicio cerere externă, nu returnează niciun anunț și nu inventează
 * date de piață: răspunde determinist `source_unavailable`. Sursele rezervate
 * (OLX, Imobiliare.ro, Storia, Publi24) rămân vizibile în interfață cu status
 * clar „indisponibilă", ca utilizatorul să nu creadă că prospectarea rulează
 * pe date reale. Când o sursă devine autorizată, se înlocuiește providerul
 * din registry, fără nicio modificare în workflow, tool-uri sau interfață.
 */
import { normalizeProspect } from "../normalize";
import {
  PROSPECTING_SOURCE_UNAVAILABLE_MESSAGE,
  type ProspectFetchResult,
  type ProspectingSourceProvider,
  type SourceHealthResult,
} from "../types";

export function unavailableProvider(key: string, label: string): ProspectingSourceProvider {
  const failure: Extract<ProspectFetchResult, { ok: false }> = {
    ok: false,
    code: "source_unavailable",
    message: `${label}: ${PROSPECTING_SOURCE_UNAVAILABLE_MESSAGE}`,
  };
  return {
    key,
    label,
    live: false,
    availability: "unavailable",
    capabilities: [],
    normalize: normalizeProspect,
    async search(): Promise<ProspectFetchResult> {
      return failure;
    },
    async fetchListing(): Promise<ProspectFetchResult> {
      return failure;
    },
    async healthCheck(): Promise<SourceHealthResult> {
      return {
        ok: false,
        code: "source_unavailable",
        message: failure.message,
        checkedAt: new Date().toISOString(),
      };
    },
  };
}
