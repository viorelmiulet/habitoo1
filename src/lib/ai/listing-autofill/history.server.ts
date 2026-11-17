import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { HISTORY_FIELDS, historyConsensus, selectHistoryRows, historyMatch, type AutofillLocation, type HistoryRow, type HistoryProposal } from "./history";
import { plainRo } from "./facts";

/** Caller RLS plus explicit organization scope; narrow projections, no addresses in AI summary. */
export async function loadAutofillHistory(client: SupabaseClient<Database>, organizationId: string, location?: AutofillLocation, signal?: AbortSignal) {
  const empty: HistoryProposal = { values: {}, confidence: {} };
  if (!location) return { history: empty, urban: false };
  let urban = false;
  if (location.localitySirutaCode) {
    let query = client.from("ro_localities").select("medium,type").eq("siruta_code", location.localitySirutaCode);
    if (signal) query = query.abortSignal(signal);
    const { data } = await query.maybeSingle();
    urban = Boolean(data && (/urban/.test(plainRo(data.medium ?? "")) || /^(oras|municipiu)/.test(plainRo(data.type))));
  }
  // residential_complex is absent in the current schema; address then <30m remain available.
  const columns = ["id", "organization_id", "deleted_at", "address", "street", "street_number", "city", "lat", "lng", ...HISTORY_FIELDS].join(",");
  const read = async (mode: "address" | "coordinates") => {
    const rows: HistoryRow[] = [];
    for (let offset = 0; ; offset += 200) {
      let query = client.from("properties").select(columns).eq("organization_id", organizationId).is("deleted_at", null).order("id").range(offset, offset + 199);
      if (signal) query = query.abortSignal(signal);
      if (location.propertyId) query = query.neq("id", location.propertyId);
      if (mode === "address") {
        if (!location.city || !location.address && !location.street) return rows;
        query = query.ilike("city", location.city.replace(/[%_]/g, ""));
      } else {
        if (location.lat == null || location.lng == null) return rows;
        const lngDelta = 0.000271 / Math.max(0.01, Math.cos(location.lat * Math.PI / 180));
        query = query.gte("lat", location.lat - 0.000271).lte("lat", location.lat + 0.000271).gte("lng", location.lng - lngDelta).lte("lng", location.lng + lngDelta);
      }
      const { data, error } = await query;
      if (error) throw new Error("Autofill history read failed");
      const page = (data ?? []) as unknown as HistoryRow[];
      const actualLocation = { ...location, residentialComplex: undefined };
      rows.push(...page.filter((row) => historyMatch(actualLocation, row) === (mode === "address" ? "address" : "coordinates")));
      const matches = selectHistoryRows(rows, organizationId, actualLocation);
      if (matches.length >= 20 || page.length < 200) return matches;
    }
  };
  const address = await read("address");
  const rows = address.length ? address : await read("coordinates");
  return { history: historyConsensus(rows, { ...location, residentialComplex: undefined }), urban };
}