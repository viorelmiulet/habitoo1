/**
 * Colectorul de anunțuri — server functions rezervate superadminului.
 *
 * Citirea datelor brute și activarea surselor sunt exclusiv ale superadminului.
 * Nimic nu rulează automat: o sursă începe să fie parcursă doar după ce este
 * activată, iar worker-ul (cron) este armat în acel moment.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { COLLECTOR_STOP_LABEL, type CollectorStopReason } from "./politeness";
import "./adapters.register";

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

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type CollectorSourceView = {
  key: string;
  label: string;
  baseUrl: string;
  enabled: boolean;
  crawlDelayMs: number;
  maxPagesPerRun: number;
  notes: string | null;
  robotsCheckedAt: string | null;
  hasAdapter: boolean;
  lastRun: {
    startedAt: string;
    finishedAt: string | null;
    status: string;
    stopReason: string | null;
    stopLabel: string | null;
    pagesFetched: number;
    itemsFound: number;
    itemsNew: number;
    itemsUpdated: number;
    errors: string[];
  } | null;
  itemsActive: number;
};

export const listCollectorSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CollectorSourceView[]> => {
    await requireSuperadmin(context as unknown as AuthContext);
    const admin = await loadAdmin();
    const { collectorAdapterKeys } = await import("./adapters");
    const adapters = collectorAdapterKeys();

    const { data: sources } = await admin
      .from("collector_sources")
      .select("*")
      .order("label", { ascending: true });

    const views: CollectorSourceView[] = [];
    for (const row of sources ?? []) {
      const { data: run } = await admin
        .from("collector_runs")
        .select("*")
        .eq("source", row.key)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { count } = await admin
        .from("collector_items")
        .select("id", { count: "exact", head: true })
        .eq("source", row.key)
        .eq("status", "active");

      const runRow = run as unknown as {
        started_at: string;
        finished_at: string | null;
        status: string;
        stop_reason: string | null;
        pages_fetched: number;
        items_found: number;
        items_new: number;
        items_updated: number;
        errors: unknown;
      } | null;

      views.push({
        key: row.key,
        label: row.label,
        baseUrl: row.base_url,
        enabled: row.enabled,
        crawlDelayMs: row.crawl_delay_ms,
        maxPagesPerRun: row.max_pages_per_run,
        notes: row.notes,
        robotsCheckedAt: row.robots_checked_at,
        hasAdapter: adapters.includes(row.key),
        itemsActive: count ?? 0,
        lastRun: runRow
          ? {
              startedAt: runRow.started_at,
              finishedAt: runRow.finished_at,
              status: runRow.status,
              stopReason: runRow.stop_reason,
              stopLabel: runRow.stop_reason
                ? (COLLECTOR_STOP_LABEL[runRow.stop_reason as CollectorStopReason] ?? null)
                : null,
              pagesFetched: runRow.pages_fetched,
              itemsFound: runRow.items_found,
              itemsNew: runRow.items_new,
              itemsUpdated: runRow.items_updated,
              errors: Array.isArray(runRow.errors) ? (runRow.errors as string[]) : [],
            }
          : null,
      });
    }
    return views;
  });

export const setCollectorSourceEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { key: string; enabled: boolean }) =>
    z.object({ key: z.string().min(1), enabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireSuperadmin(context as unknown as AuthContext);
    const admin = await loadAdmin();
    await admin
      .from("collector_sources")
      .update({ enabled: data.enabled })
      .eq("key", data.key);
    // Worker-ul se armează doar când există o sursă activată.
    if (data.enabled) await admin.rpc("collector_arm");
    return { ok: true as const, enabled: data.enabled };
  });

export const runCollectorSourceNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { key: string }) => z.object({ key: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const auth = context as unknown as AuthContext;
    await requireSuperadmin(auth);
    const admin = await loadAdmin();
    const { data: source } = await admin
      .from("collector_sources")
      .select("enabled")
      .eq("key", data.key)
      .maybeSingle();
    if (!source) throw new Error("Sursa nu există.");
    if ((source as { enabled: boolean }).enabled !== true) {
      throw new Error("Activează sursa înainte de a o rula.");
    }
    const { runCollectorSource } = await import("./engine.server");
    const outcome = await runCollectorSource(admin as never, data.key, {}, auth.userId);
    return {
      ...outcome,
      stopLabel: outcome.stopReason ? COLLECTOR_STOP_LABEL[outcome.stopReason] : null,
    };
  });
