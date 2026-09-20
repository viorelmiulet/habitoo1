/**
 * Apify — server functions rezervate superadminului.
 *
 * Rulările se pornesc exclusiv manual, din ecranul de administrare: nu există
 * cron, worker sau interval. Tokenul rămâne pe server; nimic din ce se
 * returnează nu conține configurație de autentificare.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createMarketRepository } from "../repository.server";
import { apifyMarketSourceId, estimateApifyCost, monthStartIso, sumCosts } from "./source";
import { runApifySourceImport, type ApifyRunOutcome, type ApifySourceConfig } from "./run";
import type { ApifyFieldMapping } from "./mapping";
import {
  PREDEFINED_APIFY_SOURCES,
  apifyCriteriaSummary,
  buildPredefinedApifyInput,
  getPredefinedApifySource,
  type ApifyJobCriteria,
} from "./predefined-sources";

type AuthContext = {
  userId: string;
  supabase: { rpc: (fn: string) => Promise<{ data: unknown }> };
};

async function requireSuperadmin(context: AuthContext): Promise<void> {
  const { data } = await context.supabase.rpc("is_superadmin");
  if (data !== true) {
    throw new Error("Această operațiune este rezervată administratorilor platformei.");
  }
}

/** Destinațiile sursei, cu compatibilitate pentru rândurile vechi. */
function readTargets(targets: unknown, legacy: unknown): ("market_pool" | "prospects")[] {
  const allowed = ["market_pool", "prospects"] as const;
  const list = Array.isArray(targets)
    ? targets.filter((value): value is "market_pool" | "prospects" =>
        allowed.includes(value as (typeof allowed)[number]),
      )
    : [];
  if (list.length > 0) return [...new Set(list)];
  return legacy === "prospects" ? ["prospects"] : ["market_pool"];
}

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type ApifyRunView = {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  received: number;
  created: number;
  updated: number;
  unchanged: number;
  discarded: number;
  discardReasons: { reason: string; count: number }[];
  merged: number;
  prospectsCreated: number;
  prospectsUpdated: number;
  prospectsSkipped: number;
  costUsd: number | null;
  errors: { reference: string; message: string }[];
  /** Primul element brut, ca o greșeală de mapare să se vadă imediat. */
  /** JSON text, ca o greșeală de mapare să fie vizibilă imediat. */
  firstItemJson: string | null;
  sourceKey: string;
  sourceLabel: string;
  criteriaSummary: string;
  criteria: ApifyJobCriteria | null;
  inputJson: string;
  mappingJson: string;
  maxItems: number;
  estimatedCostUsd: number | null;
};

export type ApifySourceView = {
  key: string;
  label: string;
  actorId: string;
  inputJson: string;
  fieldMappingJson: string;
  enabled: boolean;
  maxItems: number;
  targets: ("market_pool" | "prospects")[];
  prospectOrganizationId: string | null;
  unitCostUsd: number | null;
  costNote: string | null;
  notes: string | null;
  /** Cost estimat pentru o rulare la numărul maxim de rezultate. */
  estimatedCostUsd: number | null;
  spendTotalUsd: number;
  spendThisMonthUsd: number;
  marketSourceId: string;
  poolListings: number;
  lastRun: ApifyRunView | null;
};

export type ApifyOverview = {
  tokenConfigured: boolean;
  sources: ApifySourceView[];
  /** Agențiile care pot primi prospecți de la o sursă Apify. */
  organizations: { id: string; name: string }[];
  runs: ApifyRunView[];
};

function runView(row: Record<string, unknown> | null): ApifyRunView | null {
  if (!row) return null;
  const criteria =
    row["criteria"] && typeof row["criteria"] === "object"
      ? (row["criteria"] as ApifyJobCriteria)
      : null;
  return {
    id: String(row["id"]),
    status: String(row["status"] ?? "running"),
    startedAt: String(row["started_at"]),
    finishedAt: (row["finished_at"] as string | null) ?? null,
    received: Number(row["items_received"] ?? 0),
    created: Number(row["items_created"] ?? 0),
    updated: Number(row["items_updated"] ?? 0),
    unchanged: Number(row["items_unchanged"] ?? 0),
    discarded: Number(row["items_discarded"] ?? 0),
    discardReasons: (row["discard_reasons"] as ApifyRunView["discardReasons"] | null) ?? [],
    merged: Number(row["items_merged"] ?? 0),
    prospectsCreated: Number(row["prospects_created"] ?? 0),
    prospectsUpdated: Number(row["prospects_updated"] ?? 0),
    prospectsSkipped: Number(row["prospects_skipped"] ?? 0),
    costUsd: row["cost_usd"] === null ? null : Number(row["cost_usd"]),
    errors: (row["errors"] as ApifyRunView["errors"] | null) ?? [],
    firstItemJson:
      row["first_item"] === null || row["first_item"] === undefined
        ? null
        : JSON.stringify(row["first_item"], null, 2).slice(0, 8000),
    sourceKey: String(row["source_key"] ?? ""),
    sourceLabel:
      getPredefinedApifySource(String(row["source_key"] ?? ""))?.label ??
      String(row["source_key"] ?? "Sursă"),
    criteriaSummary: criteria ? apifyCriteriaSummary(criteria) : "Rulare fără criterii salvate",
    criteria,
    inputJson: JSON.stringify(row["input_snapshot"] ?? {}, null, 2).slice(0, 8000),
    mappingJson: JSON.stringify(row["field_mapping_snapshot"] ?? {}, null, 2).slice(0, 8000),
    maxItems: Number(row["max_items"] ?? 0),
    estimatedCostUsd:
      row["estimated_cost_usd"] === null || row["estimated_cost_usd"] === undefined
        ? null
        : Number(row["estimated_cost_usd"]),
  };
}

export const getApifyOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ApifyOverview> => {
    await requireSuperadmin(context as unknown as AuthContext);
    const admin = await loadAdmin();
    const { apifyTokenConfigured } = await import("./client.server");

    const { data: rows, error } = await admin
      .from("apify_sources")
      .select("*")
      .order("label", { ascending: true });
    if (error) throw error;

    const monthStart = monthStartIso();
    const configured = new Map((rows ?? []).map((row) => [row.key, row]));
    const sources: ApifySourceView[] = [];
    for (const definition of PREDEFINED_APIFY_SOURCES) {
      const row = configured.get(definition.key);
      const maxItems = Number(row?.max_items ?? 100);
      const unitCost = definition.unitCostUsd;
      const [{ data: lastRun }, { data: monthRuns }, { count }] = await Promise.all([
        admin
          .from("apify_runs")
          .select("*")
          .eq("source_key", definition.key)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        admin
          .from("apify_runs")
          .select("cost_usd")
          .eq("source_key", definition.key)
          .gte("started_at", monthStart),
        admin
          .from("market_listings")
          .select("id", { count: "exact", head: true })
          .eq("source", apifyMarketSourceId(definition.key)),
      ]);

      sources.push({
        key: definition.key,
        label: definition.label,
        actorId: definition.actorId,
        inputJson: JSON.stringify(definition.inputTemplate, null, 2),
        fieldMappingJson: JSON.stringify(definition.fieldMapping, null, 2),
        enabled: true,
        maxItems,
        targets: definition.targets,
        prospectOrganizationId: row?.prospect_organization_id ?? null,
        unitCostUsd: unitCost,
        costNote: row?.cost_note ?? null,
        notes: definition.description,
        estimatedCostUsd: estimateApifyCost(maxItems, unitCost),
        spendTotalUsd: Number(row?.spend_total_usd ?? 0),
        spendThisMonthUsd: sumCosts(
          (monthRuns ?? []).map((r) => (r.cost_usd === null ? null : Number(r.cost_usd))),
        ),
        marketSourceId: apifyMarketSourceId(definition.key),
        poolListings: count ?? 0,
        lastRun: runView((lastRun as Record<string, unknown> | null) ?? null),
      });
    }

    const { data: orgRows } = await admin
      .from("organizations")
      .select("id,name")
      .order("name", { ascending: true });

    const { data: runRows } = await admin
      .from("apify_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(100);

    return {
      tokenConfigured: apifyTokenConfigured(),
      sources,
      organizations: (orgRows ?? []).map((org) => ({ id: org.id, name: org.name })),
      runs: (runRows ?? [])
        .map((row) => runView(row as unknown as Record<string, unknown>))
        .filter((row): row is ApifyRunView => row !== null),
    };
  });

const sourceInput = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_]+$/, "Cheia poate conține doar litere mici, cifre și liniuță de subliniere."),
  label: z.string().trim().min(1).max(160),
  actorId: z.string().trim().min(1).max(160),
  input: z.record(z.string(), z.unknown()).default({}),
  fieldMapping: z.record(z.string(), z.union([z.string(), z.array(z.string())])).default({}),
  maxItems: z.number().int().min(1).max(10000),
  targets: z
    .array(z.enum(["market_pool", "prospects"]))
    .min(1)
    .max(2),
  prospectOrganizationId: z.string().uuid().nullable().optional(),
  unitCostUsd: z.number().finite().min(0).max(1000).nullable().optional(),
  costNote: z.string().trim().max(400).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  enabled: z.boolean().optional(),
});

/** Adăugarea unei surse noi este pură configurație: niciun cod nou. */
export const saveApifySource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sourceInput.parse(data))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await requireSuperadmin(context as unknown as AuthContext);
    const admin = await loadAdmin();
    const { error } = await admin.from("apify_sources").upsert(
      {
        key: data.key,
        label: data.label,
        actor_id: data.actorId,
        input: data.input as never,
        field_mapping: data.fieldMapping as never,
        max_items: data.maxItems,
        targets: data.targets,
        // `target` rămâne sincronizat cu prima destinație pentru compatibilitate.
        target: data.targets[0],
        prospect_organization_id: data.prospectOrganizationId ?? null,
        unit_cost_usd: data.unitCostUsd ?? null,
        cost_note: data.costNote ?? null,
        notes: data.notes ?? null,
        ...(data.enabled === undefined ? {} : { enabled: data.enabled }),
      } as never,
      { onConflict: "key" },
    );
    if (error) throw error;
    return { ok: true };
  });

export const setApifySourceEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        key: z.string().trim().min(1).max(60),
        enabled: z.boolean().optional(),
        maxItems: z.number().int().min(1).max(10000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    await requireSuperadmin(context as unknown as AuthContext);
    const admin = await loadAdmin();
    const patch: Record<string, unknown> = {};
    if (data.enabled !== undefined) patch["enabled"] = data.enabled;
    if (data.maxItems !== undefined) patch["max_items"] = data.maxItems;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await admin
      .from("apify_sources")
      .update(patch as never)
      .eq("key", data.key);
    if (error) throw error;
    return { ok: true };
  });

export type ApifyRunResult = {
  runId: string;
  status: ApifyRunOutcome["status"];
  received: number;
  created: number;
  updated: number;
  unchanged: number;
  discarded: number;
  discardReasons: { reason: string; count: number }[];
  merged: number;
  prospectsCreated: number;
  prospectsUpdated: number;
  prospectsSkipped: number;
  costUsd: number | null;
  errors: { reference: string; message: string }[];
};

const jobInput = z.object({
  sourceKey: z.string().trim().min(1).max(60),
  criteria: z.object({
    transactionType: z.enum(["sale", "rent"]),
    propertyType: z.enum([
      "apartment",
      "studio",
      "house",
      "land",
      "commercial",
      "office",
      "industrial",
    ]),
    county: z.string().trim().min(1).max(120),
    locality: z.string().trim().min(1).max(120),
    localitySirutaCode: z.number().int().positive(),
    zone: z.string().trim().max(160).nullable(),
    maxItems: z.number().int().min(1).max(10000),
  }),
  prospectOrganizationId: z.string().uuid().nullable(),
  advancedInput: z.record(z.string(), z.unknown()).nullable(),
  advancedMapping: z.record(z.string(), z.unknown()).nullable(),
});

/** Rulare manuală: pornită doar de un superadmin, niciodată automat. */
export const runApifySource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => jobInput.parse(data))
  .handler(async ({ context, data }): Promise<ApifyRunResult> => {
    const ctx = context as unknown as AuthContext;
    await requireSuperadmin(ctx);
    const userId = (context as unknown as { userId: string }).userId;
    const admin = await loadAdmin();
    const { apifyTokenConfigured, startApifyRun, waitForApifyRun, readApifyDataset } =
      await import("./client.server");

    const definition = getPredefinedApifySource(data.sourceKey);
    if (!definition) throw new Error("Sursa predefinită nu a fost găsită.");
    if (data.criteria.maxItems > definition.maxResults) {
      throw new Error(`Sursa permite maximum ${definition.maxResults} rezultate per job.`);
    }
    if (definition.prospectOrganizationRequired && !data.prospectOrganizationId) {
      throw new Error("Alege agenția care primește prospecții.");
    }
    const generatedInput = buildPredefinedApifyInput(definition, data.criteria);
    const effectiveInput = data.advancedInput ?? generatedInput;
    const effectiveMapping = (data.advancedMapping ?? definition.fieldMapping) as ApifyFieldMapping;

    const { data: existingRow } = await admin
      .from("apify_sources")
      .select("spend_total_usd")
      .eq("key", definition.key)
      .maybeSingle();

    const { error: sourceError } = await admin.from("apify_sources").upsert(
      {
        key: definition.key,
        label: definition.label,
        actor_id: definition.actorId,
        input: definition.inputTemplate as never,
        field_mapping: definition.fieldMapping as never,
        enabled: true,
        max_items: data.criteria.maxItems,
        targets: definition.targets,
        target: definition.targets[0],
        prospect_organization_id: data.prospectOrganizationId,
        unit_cost_usd: definition.unitCostUsd,
        notes: definition.description,
      } as never,
      { onConflict: "key" },
    );
    if (sourceError) throw sourceError;

    const source: ApifySourceConfig = {
      key: definition.key,
      label: definition.label,
      actorId: definition.actorId,
      input: effectiveInput,
      fieldMapping: effectiveMapping,
      enabled: true,
      maxItems: data.criteria.maxItems,
      targets: definition.targets,
      prospectOrganizationId: data.prospectOrganizationId,
    };

    const sourceId = apifyMarketSourceId(source.key);
    const now = new Date().toISOString();

    // Jurnalul comun de import: aceeași mașinărie folosită de restul surselor.
    const { data: importRun, error: importRunError } = await admin
      .from("market_import_runs")
      .insert({
        source: sourceId,
        format: "json",
        mode: "partial",
        status: "running",
        triggered_by: userId,
        started_at: now,
      })
      .select("id")
      .single();
    if (importRunError) throw importRunError;

    const { data: runRow, error: runRowError } = await admin
      .from("apify_runs")
      .insert({
        source_key: source.key,
        status: "running",
        started_at: now,
        market_import_run_id: importRun.id,
        triggered_by: userId,
        criteria: data.criteria as never,
        input_snapshot: effectiveInput as never,
        field_mapping_snapshot: effectiveMapping as never,
        max_items: data.criteria.maxItems,
        estimated_cost_usd: estimateApifyCost(data.criteria.maxItems, definition.unitCostUsd),
      })
      .select("id")
      .single();
    if (runRowError) throw runRowError;

    let outcome: ApifyRunOutcome;
    try {
      outcome = await runApifySourceImport({
        source,
        repo: createMarketRepository(admin),
        now,
        runId: importRun.id,
        tokenConfigured: apifyTokenConfigured,
        claimLock: async () => {
          const { data: claimed, error: claimError } = await admin.rpc("market_sync_claim", {
            _source: sourceId,
            _stale_seconds: 900,
          });
          if (claimError) throw claimError;
          return claimed === true;
        },
        releaseLock: async (ok, message) => {
          await admin.rpc("market_sync_release", {
            _source: sourceId,
            _ok: ok,
            _error: message ?? undefined,
            _run_id: importRun.id,
          });
        },
        startRun: async (input) => {
          const started = await startApifyRun(input);
          return { id: started.id, datasetId: started.datasetId };
        },
        waitRun: async (runId) => {
          const { info, timedOut } = await waitForApifyRun(runId);
          return {
            status: info.status,
            datasetId: info.datasetId,
            costUsd: info.costUsd,
            usage: info.usage,
            timedOut,
          };
        },
        readDataset: (input) => readApifyDataset(input),
        writeProspects: async ({ organizationId, prospects }) => {
          const { writeApifyProspects } = await import("./prospects.server");
          return writeApifyProspects(admin, organizationId, prospects, now);
        },
      });
    } catch (policyError) {
      const message =
        policyError instanceof Error ? policyError.message : "Rularea a fost refuzată.";
      await admin
        .from("apify_runs")
        .update({
          status: "refused",
          finished_at: new Date().toISOString(),
          errors: [{ reference: source.key, message }] as never,
        })
        .eq("id", runRow.id);
      await admin
        .from("market_import_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          errors: [{ reference: source.key, message }] as never,
        })
        .eq("id", importRun.id);
      throw policyError;
    }

    await admin
      .from("apify_runs")
      .update({
        status: outcome.status,
        apify_run_id: outcome.apifyRunId,
        apify_dataset_id: outcome.apifyDatasetId,
        finished_at: outcome.finishedAt,
        items_received: outcome.received,
        items_created: outcome.created,
        items_updated: outcome.updated,
        items_unchanged: outcome.unchanged,
        items_discarded: outcome.discarded,
        discard_reasons: outcome.discardReasons as never,
        items_merged: outcome.merged,
        prospects_created: outcome.prospectsCreated,
        prospects_updated: outcome.prospectsUpdated,
        prospects_skipped: outcome.prospectsSkipped,
        cost_usd: outcome.costUsd,
        usage: (outcome.usage ?? null) as never,
        first_item: (outcome.firstItem ?? null) as never,
        errors: outcome.errors.slice(0, 100) as never,
      })
      .eq("id", runRow.id);

    await admin
      .from("market_import_runs")
      .update({
        status: outcome.status === "completed" ? "completed" : "failed",
        finished_at: outcome.finishedAt,
        items_received: outcome.received,
        items_created: outcome.created,
        items_updated: outcome.updated,
        items_unchanged: outcome.unchanged,
        items_invalid: outcome.discarded,
        cross_portal_merges: outcome.merged,
        errors: outcome.errors.slice(0, 100) as never,
      })
      .eq("id", importRun.id);

    await admin
      .from("apify_sources")
      .update({
        last_run_id: runRow.id,
        spend_total_usd: Number(existingRow?.spend_total_usd ?? 0) + (outcome.costUsd ?? 0),
      })
      .eq("key", source.key);

    return {
      runId: runRow.id,
      status: outcome.status,
      received: outcome.received,
      created: outcome.created,
      updated: outcome.updated,
      unchanged: outcome.unchanged,
      discarded: outcome.discarded,
      discardReasons: outcome.discardReasons,
      merged: outcome.merged,
      prospectsCreated: outcome.prospectsCreated,
      prospectsUpdated: outcome.prospectsUpdated,
      prospectsSkipped: outcome.prospectsSkipped,
      costUsd: outcome.costUsd,
      errors: outcome.errors,
    };
  });
