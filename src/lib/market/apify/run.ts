/**
 * Orchestrarea unei rulări Apify — logică testabilă, fără acces direct la
 * rețea sau la baza de date (totul prin dependențe injectate).
 *
 * Reguli:
 *  - o sursă oprită nu rulează niciodată;
 *  - fără token configurat nu se pornește nimic și nu se simulează nimic;
 *  - două rulări ale aceleiași surse nu se pot suprapune (lock);
 *  - scrierea se face prin pipeline-ul existent (`ingestListings`), deci
 *    deduplicarea, istoricul de preț și snapshot-urile rămân cele actuale.
 */
import { ingestListings, type ImportSummary, type MarketRepository } from "../ingest";
import { mapApifyItems, summarizeDiscards, type ApifyFieldMapping } from "./mapping";
import { apifyMarketSourceId } from "./source";

export type ApifySourceConfig = {
  key: string;
  label: string;
  actorId: string;
  input: Record<string, unknown>;
  fieldMapping: ApifyFieldMapping | null;
  enabled: boolean;
  maxItems: number;
  target: "market_pool" | "prospects";
};

export type ApifyRunOutcome = {
  sourceKey: string;
  status: "completed" | "failed";
  apifyRunId: string | null;
  apifyDatasetId: string | null;
  received: number;
  created: number;
  updated: number;
  unchanged: number;
  discarded: number;
  discardReasons: { reason: string; count: number }[];
  costUsd: number | null;
  usage: Record<string, unknown> | null;
  firstItem: unknown;
  errors: { reference: string; message: string }[];
  startedAt: string;
  finishedAt: string;
};

export type ApifyRunDeps = {
  source: ApifySourceConfig;
  repo: MarketRepository;
  now: string;
  runId: string | null;
  tokenConfigured: () => boolean;
  /** Blocarea sursei: `false` = altă rulare este deja în curs. */
  claimLock: () => Promise<boolean>;
  releaseLock: (ok: boolean, error: string | null) => Promise<void>;
  startRun: (input: {
    actorId: string;
    input: Record<string, unknown>;
    maxItems: number;
  }) => Promise<{ id: string; datasetId: string | null }>;
  waitRun: (runId: string) => Promise<{
    status: string;
    datasetId: string | null;
    costUsd: number | null;
    usage: Record<string, unknown> | null;
    timedOut: boolean;
  }>;
  readDataset: (input: { datasetId: string; maxItems: number }) => Promise<unknown[]>;
};

export const APIFY_SOURCE_DISABLED =
  "Sursa este oprită. Pornește-o din ecranul de administrare înainte de a rula.";
export const APIFY_RUN_IN_PROGRESS = "O rulare este deja în curs pentru această sursă.";
export const APIFY_TARGET_NOT_IMPLEMENTED =
  "Destinația „prospecți” nu are încă traseu de scriere implementat.";

function emptyOutcome(deps: ApifyRunDeps): ApifyRunOutcome {
  return {
    sourceKey: deps.source.key,
    status: "failed",
    apifyRunId: null,
    apifyDatasetId: null,
    received: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
    discarded: 0,
    discardReasons: [],
    costUsd: null,
    usage: null,
    firstItem: null,
    errors: [],
    startedAt: deps.now,
    finishedAt: deps.now,
  };
}

/** Pornește, așteaptă, mapează și importă. Aruncă doar la refuzuri de politică. */
export async function runApifySourceImport(deps: ApifyRunDeps): Promise<ApifyRunOutcome> {
  if (!deps.source.enabled) throw new Error(APIFY_SOURCE_DISABLED);
  if (deps.source.target !== "market_pool") throw new Error(APIFY_TARGET_NOT_IMPLEMENTED);
  if (!deps.tokenConfigured()) {
    const { APIFY_TOKEN_MISSING } = await import("./token-message");
    throw new Error(APIFY_TOKEN_MISSING);
  }

  const claimed = await deps.claimLock();
  if (!claimed) throw new Error(APIFY_RUN_IN_PROGRESS);

  const outcome = emptyOutcome(deps);
  try {
    const started = await deps.startRun({
      actorId: deps.source.actorId,
      input: deps.source.input,
      maxItems: deps.source.maxItems,
    });
    outcome.apifyRunId = started.id;
    outcome.apifyDatasetId = started.datasetId;

    const finished = await deps.waitRun(started.id);
    outcome.costUsd = finished.costUsd;
    outcome.usage = finished.usage;
    outcome.apifyDatasetId = finished.datasetId ?? started.datasetId;

    if (finished.timedOut) {
      outcome.errors.push({
        reference: deps.source.key,
        message:
          "Rularea Apify nu s-a încheiat în timpul alocat. Rezultatele pot fi importate la o rulare ulterioară.",
      });
    }
    if (!finished.timedOut && finished.status !== "SUCCEEDED") {
      outcome.errors.push({
        reference: deps.source.key,
        message: `Rularea Apify s-a încheiat cu starea ${finished.status}.`,
      });
    }

    const items = outcome.apifyDatasetId
      ? await deps.readDataset({
          datasetId: outcome.apifyDatasetId,
          maxItems: deps.source.maxItems,
        })
      : [];
    outcome.received = items.length;
    outcome.firstItem = items[0] ?? null;

    const sourceId = apifyMarketSourceId(deps.source.key);
    const { listings, discarded } = mapApifyItems(sourceId, items, deps.source.fieldMapping);
    outcome.discarded = discarded.length;
    outcome.discardReasons = summarizeDiscards(discarded);

    const summary: ImportSummary = await ingestListings(
      deps.repo,
      { source: sourceId, mode: "partial", runId: deps.runId, now: deps.now },
      listings,
    );
    outcome.created = summary.created;
    outcome.updated = summary.updated;
    outcome.unchanged = summary.unchanged;
    outcome.errors.push(...summary.errors);
    outcome.status =
      outcome.errors.length === 0 || summary.created + summary.updated + summary.unchanged > 0
        ? "completed"
        : "failed";
    outcome.finishedAt = new Date().toISOString();
    await deps.releaseLock(
      outcome.status === "completed",
      outcome.errors[0]?.message ?? null,
    );
    return outcome;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Eroare necunoscută la rularea Apify.";
    outcome.status = "failed";
    outcome.errors.push({ reference: deps.source.key, message });
    outcome.finishedAt = new Date().toISOString();
    await deps.releaseLock(false, message);
    return outcome;
  }
}
