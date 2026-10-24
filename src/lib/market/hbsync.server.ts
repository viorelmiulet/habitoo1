import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { normalizeHbsyncMarketListing } from "./hbsync";
import { emptySummary, ingestListings } from "./ingest";
import { createMarketRepository } from "./repository.server";
import type { NormalizedListing } from "./normalize";

export async function importHbsyncMarket(admin: SupabaseClient<Database>, records: unknown[]) {
  const summary = emptySummary();
  const groups = new Map<string, NormalizedListing[]>();
  const rejected: { reference: string; message: string }[] = [];
  for (const record of records) {
    const normalized = normalizeHbsyncMarketListing(record);
    if (!normalized.ok) { rejected.push(normalized); continue; }
    const group = groups.get(normalized.listing.source) ?? [];
    group.push(normalized.listing);
    groups.set(normalized.listing.source, group);
  }
  const now = new Date().toISOString();
  for (const [source, listings] of groups) {
    const sourceErrors = (message: string) => listings.map(listing => ({ reference: listing.sourceListingId ?? "", message }));
    let runId: string | null = null;
    let success = false;
    let lockClaimed = false;
    try {
      const { data: claimed, error: claimError } = await admin.rpc("market_sync_claim", { _source: source });
      if (claimError) throw claimError;
      if (!claimed) {
        summary.errors.push(...sourceErrors("Un import pentru această sursă rulează deja. Reîncearcă lotul."));
        continue;
      }
      lockClaimed = true;
      const { data: run, error } = await admin.from("market_import_runs").insert({ source, format: "json", mode: "partial", status: "running" }).select("id").single();
      if (error) throw error;
      runId = run.id;
      const repository = createMarketRepository(admin);
      // Preserve every portal identity/classification; existing entity matching still deduplicates ACP.
      const result = await ingestListings({ ...repository, findCrossPortalCandidates: async () => [] },
        { source, mode: "partial", runId, now }, listings);
      success = result.errors.length === 0;
      const { error: finishError } = await admin.from("market_import_runs").update({
        status: success ? "completed" : "failed", finished_at: new Date().toISOString(),
        items_received: result.received, items_created: result.created, items_updated: result.updated,
        items_unchanged: result.unchanged, duplicates_detected: result.duplicates,
        ambiguous_matches: result.ambiguous, price_changes: result.priceChanges,
        status_changes: result.statusChanges, errors: result.errors,
      }).eq("id", runId);
      if (finishError) throw finishError;
      for (const key of ["received", "created", "updated", "unchanged", "duplicates", "ambiguous", "priceChanges", "statusChanges"] as const) summary[key] += result[key];
      summary.errors.push(...result.errors);
    } catch {
      success = false;
      summary.errors.push(...sourceErrors("Importul sursei a eșuat."));
      if (runId) {
        try {
          await admin.from("market_import_runs").update({ status: "failed", finished_at: new Date().toISOString(), errors: sourceErrors("Import eșuat.") }).eq("id", runId);
        } catch { /* Preserve per-listing errors and continue with the other sources. */ }
      }
    } finally {
      if (lockClaimed) {
        try {
          const { error } = await admin.rpc("market_sync_release", { _source: source, _ok: success, _run_id: runId ?? undefined, _error: success ? undefined : "Import hbsync incomplet." });
          if (error) summary.errors.push(...sourceErrors("Nu s-a putut elibera blocarea importului."));
        } catch {
          summary.errors.push(...sourceErrors("Nu s-a putut elibera blocarea importului."));
        }
      }
    }
  }
  return { success: summary.created + summary.updated + summary.unchanged > 0, received: records.length,
    imported: summary.created + summary.updated + summary.unchanged, created: summary.created,
    updated: summary.updated, unchanged: summary.unchanged, rejected: rejected.length,
    errors: [...rejected.map(({ reference, message }) => ({ reference, message })), ...summary.errors] };
}