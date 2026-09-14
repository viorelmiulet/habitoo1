/**
 * Provider pentru liste proprii (Stage 13).
 *
 * Nu face nicio cerere externă: citește anunțurile introduse explicit în
 * configurația sursei (`configuration.items`). Este folosit pentru listele
 * proprii ale agenției și pentru testele end-to-end, unde datele sunt marcate
 * clar drept fixture — niciodată prezentate ca date reale de piață.
 */
import { normalizeProspect } from "../normalize";
import {
  type ProspectFetchResult,
  type ProspectSource,
  type ProspectingSourceProvider,
  type RawProspect,
} from "../types";

export const MANUAL_LIST_PROVIDER_KEY = "manual_list";

function itemsOf(source: ProspectSource): RawProspect[] {
  const raw = source.configuration["items"];
  if (!Array.isArray(raw)) return [];
  const fixture = source.configuration["fixture"] === true;
  const out: RawProspect[] = [];
  for (const entry of raw.slice(0, 50)) {
    if (typeof entry !== "object" || entry === null) continue;
    const item = entry as Record<string, unknown>;
    const title = item["title"];
    if (typeof title !== "string" || title.trim() === "") continue;
    out.push({
      sourceKey: MANUAL_LIST_PROVIDER_KEY,
      externalId: item["externalId"] === undefined ? null : String(item["externalId"]),
      url: typeof item["url"] === "string" ? item["url"] : null,
      title,
      description: typeof item["description"] === "string" ? item["description"] : null,
      fields: typeof item["fields"] === "object" && item["fields"] !== null
        ? (item["fields"] as Record<string, unknown>)
        : item,
      fetchedAt: new Date().toISOString(),
      fixture,
    });
  }
  return out;
}

export const manualListProvider: ProspectingSourceProvider = {
  key: MANUAL_LIST_PROVIDER_KEY,
  label: "Listă proprie",
  live: false,
  normalize: normalizeProspect,

  async search(_criteria, source): Promise<ProspectFetchResult> {
    if (!source.enabled) {
      return {
        ok: false,
        code: "not_configured",
        message: "Lista proprie este dezactivată pentru această agenție.",
      };
    }
    const items = itemsOf(source);
    if (items.length === 0) {
      return { ok: false, code: "not_configured", message: "Lista proprie nu conține anunțuri." };
    }
    return { ok: true, items, fixture: source.configuration["fixture"] === true };
  },

  async fetchListing(reference, source): Promise<ProspectFetchResult> {
    const items = itemsOf(source).filter(
      (item) => item.externalId === reference || item.url === reference,
    );
    if (items.length === 0) {
      return { ok: false, code: "failed", message: "Anunțul nu există în lista proprie." };
    }
    return { ok: true, items, fixture: source.configuration["fixture"] === true };
  },

  async healthCheck(source) {
    const checkedAt = new Date().toISOString();
    const count = itemsOf(source).length;
    if (!source.enabled || count === 0) {
      return {
        ok: false,
        code: "not_configured",
        message: "Lista proprie nu are anunțuri active.",
        checkedAt,
      };
    }
    return { ok: true, code: "ok", message: `${count} anunțuri în listă.`, checkedAt };
  },
};
