/**
 * Engine-ul colectorului (server-only).
 *
 * Parcurge paginile unei surse activate, respectă robots.txt și pauza cerută,
 * salvează itemii deduplicați și amprentele vânzătorilor. Nu descarcă imagini
 * și nu salvează niciodată un număr de telefon în clar. Porturile (fetch,
 * sleep, now) sunt injectabile, ca să poată fi testat fără rețea.
 */
import {
  collectorAdapter,
  normalizeParseResult,
  type CollectorAdapter,
  type CollectorParsedItem,
} from "./adapters";
import "./adapters.register";
import { collectorFetch, type CollectorFetchResult } from "./fetch.server";
import { listingHash, sellerFingerprint } from "./fingerprint.server";
import {
  COLLECTOR_STOP_LABEL,
  COLLECTOR_USER_AGENT,
  MAX_CONSECUTIVE_ERRORS,
  effectiveCrawlDelayMs,
  isNotModified,
  isSuccessStatus,
  pageCap,
  stopReasonForStatus,
  type CollectorStopReason,
} from "./politeness";
import {
  inferSellerType,
  sanitizeImageUrls,
  type CollectorNormalizedFields,
} from "./normalize";
import { parseRobotsTxt, robotsAllows, robotsCrawlDelayMs, urlPathForRobots } from "./robots";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type CollectorAdmin = {
  from: (table: string) => any;
  rpc: (name: "claim_collector_source" | "release_collector_source" | "collector_arm", params?: any) => any;
};

export type CollectorSourceRow = {
  id: string;
  key: string;
  label: string;
  base_url: string;
  enabled: boolean;
  robots_checked_at: string | null;
  robots_body: string | null;
  crawl_delay_ms: number;
  max_pages_per_run: number;
};

export type CollectorRunOutcome = {
  runId: string | null;
  source: string;
  status: "done" | "stopped" | "failed";
  stopReason: CollectorStopReason | null;
  pagesFetched: number;
  itemsFound: number;
  itemsNew: number;
  itemsUpdated: number;
  errors: string[];
};

export type CollectorPorts = {
  fetchPage?: (url: string, options: { etag?: string | null; lastModified?: string | null }) => Promise<CollectorFetchResult>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  adapter?: CollectorAdapter | null;
  budgetMs?: number;
  /** TTL-ul lock-ului pe sursă, în secunde. */
  lockTtlSeconds?: number;
};

const ROBOTS_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BUDGET_MS = 40_000;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function normalizedFields(raw: Record<string, unknown>): CollectorNormalizedFields {
  const num = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  const str = (value: unknown): string | null => (typeof value === "string" ? value : null);
  return {
    title: str(raw["title"]),
    description: str(raw["description"]),
    price: num(raw["price"]),
    currency: str(raw["currency"]),
    rooms: num(raw["rooms"]),
    area: num(raw["area"]),
    city: str(raw["city"]),
    county: str(raw["county"]),
    transaction: str(raw["transaction"]),
    propertyType: str(raw["propertyType"]),
    imageUrls: sanitizeImageUrls(raw["imageUrls"]),
  };
}

/** Curăță orice câmp care ar putea conține telefon înainte de salvare. */
const PHONE_KEYS = ["phone", "phones", "telefon", "mobile", "mobil", "contactphone", "contact_phone"];

export function stripPhoneFields<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => stripPhoneFields(item)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase().replace(/[_-]/g, "");
      if (PHONE_KEYS.includes(normalizedKey)) continue;
      out[key] = stripPhoneFields(inner);
    }
    return out as unknown as T;
  }
  return value;
}

/* ------------------------------- robots.txt ------------------------------- */

export async function ensureRobots(
  admin: CollectorAdmin,
  source: CollectorSourceRow,
  ports: CollectorPorts,
): Promise<{ body: string | null; crawlDelayMs: number | null }> {
  const now = ports.now?.() ?? Date.now();
  const checkedAt = source.robots_checked_at ? Date.parse(source.robots_checked_at) : 0;
  if (source.robots_body !== null && now - checkedAt < ROBOTS_MAX_AGE_MS) {
    const rules = parseRobotsTxt(source.robots_body);
    return { body: source.robots_body, crawlDelayMs: robotsCrawlDelayMs(rules, COLLECTOR_USER_AGENT) };
  }

  const fetchPage = ports.fetchPage ?? collectorFetch;
  const robotsUrl = new URL("/robots.txt", source.base_url).toString();
  const result = await fetchPage(robotsUrl, {});
  const body = isSuccessStatus(result.status) ? (result.body ?? "") : "";
  await admin
    .from("collector_sources")
    .update({ robots_body: body, robots_checked_at: new Date(now).toISOString() })
    .eq("key", source.key);
  const rules = parseRobotsTxt(body);
  return { body, crawlDelayMs: robotsCrawlDelayMs(rules, COLLECTOR_USER_AGENT) };
}

/* --------------------------------- itemii -------------------------------- */

async function persistItem(
  admin: CollectorAdmin,
  source: CollectorSourceRow,
  item: CollectorParsedItem,
  page: { etag: string | null; lastModified: string | null },
): Promise<"new" | "updated"> {
  const fields = normalizedFields(item.normalized);
  const hash = listingHash(fields);
  const fingerprint = sellerFingerprint(item.phone ?? null);
  const nowIso = new Date().toISOString();

  const { data: existing } = await admin
    .from("collector_items")
    .select("id, listing_hash, first_seen_at")
    .eq("source", source.key)
    .eq("url", item.url)
    .maybeSingle();

  const payload = {
    source: source.key,
    source_item_id: item.sourceItemId ?? null,
    url: item.url,
    last_seen_at: nowIso,
    status: "active",
    listing_hash: hash,
    raw: stripPhoneFields(item.raw ?? {}),
    normalized: stripPhoneFields({ ...fields, imageUrls: fields.imageUrls ?? [] }),
    etag: page.etag,
    last_modified: page.lastModified,
    seller_fingerprint: fingerprint,
  };

  if (existing) {
    await admin.from("collector_items").update(payload).eq("id", existing.id);
  } else {
    await admin.from("collector_items").insert({ ...payload, first_seen_at: nowIso });
  }

  if (fingerprint) {
    const { data: known } = await admin
      .from("collector_seller_fingerprints")
      .select("fingerprint, items_count")
      .eq("source", source.key)
      .eq("fingerprint", fingerprint)
      .maybeSingle();
    const itemsCount = existing ? (known?.items_count ?? 1) : (known?.items_count ?? 0) + 1;
    const signals = stripPhoneFields({
      ...(item.signals ?? {}),
      declaredAgency: item.declaredAgency ?? null,
      declaredOwner: item.declaredOwner ?? null,
    });
    const inferred =
      item.inferredType && item.inferredType !== "unknown"
        ? item.inferredType
        : inferSellerType({
            itemsCount,
            declaredAgency: item.declaredAgency ?? null,
            declaredOwner: item.declaredOwner ?? null,
          });
    if (known) {
      await admin
        .from("collector_seller_fingerprints")
        .update({ last_seen_at: nowIso, items_count: itemsCount, inferred_type: inferred, signals })
        .eq("source", source.key)
        .eq("fingerprint", fingerprint);
    } else {
      await admin.from("collector_seller_fingerprints").insert({
        source: source.key,
        fingerprint,
        first_seen_at: nowIso,
        last_seen_at: nowIso,
        items_count: itemsCount,
        inferred_type: inferred,
        signals,
      });
    }
  }

  // Re-listarea identică nu creează duplicat: doar last_seen_at se mișcă.
  return existing ? "updated" : "new";
}

/* -------------------------------- rularea -------------------------------- */

export async function runCollectorSource(
  admin: CollectorAdmin,
  sourceKey: string,
  ports: CollectorPorts = {},
  startedBy: string | null = null,
): Promise<CollectorRunOutcome> {
  const empty: CollectorRunOutcome = {
    runId: null,
    source: sourceKey,
    status: "stopped",
    stopReason: null,
    pagesFetched: 0,
    itemsFound: 0,
    itemsNew: 0,
    itemsUpdated: 0,
    errors: [],
  };

  // Nimic nu rulează dacă sursa nu e activată de un superadmin (gardă în SQL).
  const { data: claimed } = await admin.rpc("claim_collector_source", {
    _key: sourceKey,
    _ttl_seconds: ports.lockTtlSeconds ?? 300,
  });
  const source = (Array.isArray(claimed) ? claimed[0] : claimed) as CollectorSourceRow | undefined;
  if (!source) return { ...empty, stopReason: null };

  const adapter = ports.adapter ?? collectorAdapter(sourceKey);
  const fetchPage = ports.fetchPage ?? collectorFetch;
  const sleep = ports.sleep ?? defaultSleep;
  const now = ports.now ?? Date.now;
  const budgetMs = ports.budgetMs ?? DEFAULT_BUDGET_MS;
  const startedAt = now();

  const { data: run } = await admin
    .from("collector_runs")
    .insert({ source: sourceKey, status: "running", started_by: startedBy })
    .select("id")
    .maybeSingle();
  const runId = (run?.id ?? null) as string | null;

  let pages = 0;
  let found = 0;
  let created = 0;
  let updated = 0;
  let consecutiveErrors = 0;
  const errors: string[] = [];
  let stopReason: CollectorStopReason | null = null;
  let status: CollectorRunOutcome["status"] = "done";

  try {
    if (!adapter) {
      stopReason = "no_adapter";
      status = "stopped";
    } else {
      const robots = await ensureRobots(admin, source, ports);
      const rules = parseRobotsTxt(robots.body);
      const delayMs = effectiveCrawlDelayMs(source.crawl_delay_ms, robots.crawlDelayMs);
      const cap = pageCap(source.max_pages_per_run);
      const config = (source as { config?: unknown }).config ?? {};
      const prepared = adapter.prepare ? await adapter.prepare({ admin, config }) : undefined;

      for (let page = 1; page <= cap; page += 1) {
        if (now() - startedAt > budgetMs) {
          stopReason = "budget";
          status = "stopped";
          break;
        }
        const url = adapter.pageUrl({ baseUrl: source.base_url, config, prepared, page });
        if (!url) {
          stopReason = "no_more_pages";
          break;
        }
        if (!robotsAllows(rules, COLLECTOR_USER_AGENT, urlPathForRobots(url))) {
          stopReason = "robots_disallow";
          status = "stopped";
          break;
        }
        if (pages > 0) await sleep(delayMs);

        const result = await fetchPage(url, {});
        pages += 1;

        const hardStop = stopReasonForStatus(result.status);
        if (hardStop) {
          stopReason = hardStop;
          status = "stopped";
          errors.push(COLLECTOR_STOP_LABEL[hardStop]);
          break;
        }
        if (isNotModified(result.status)) {
          consecutiveErrors = 0;
          continue;
        }
        if (!isSuccessStatus(result.status) || !result.body) {
          consecutiveErrors += 1;
          errors.push(`${url}: ${result.error ?? `răspuns ${result.status}`}`);
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            stopReason = "too_many_errors";
            status = "stopped";
            break;
          }
          continue;
        }
        consecutiveErrors = 0;

        const parsed = normalizeParseResult(
          adapter.parsePage({ url, body: result.body, baseUrl: source.base_url, config, prepared }),
        );
        // Markup schimbat: eșecul se consemnează pe item, rularea continuă,
        // dar nu se salvează rânduri incomplete.
        for (const failure of parsed.failures) {
          errors.push(`${failure.url ?? url}: ${failure.reason}`);
        }
        for (const item of parsed.items) {
          found += 1;
          try {
            const outcome = await persistItem(admin, source, item, {
              etag: result.etag,
              lastModified: result.lastModified,
            });
            if (outcome === "new") created += 1;
            else updated += 1;
          } catch (error) {
            errors.push(
              `${item.url}: ${error instanceof Error ? error.message : "salvarea a eșuat"}`,
            );
          }
        }
        if (page === cap) stopReason = "page_cap";
      }
    }
  } catch (error) {
    status = "failed";
    stopReason = stopReason ?? "fetch_failed";
    errors.push(error instanceof Error ? error.message : "Rularea a eșuat.");
  } finally {
    if (runId) {
      await admin
        .from("collector_runs")
        .update({
          finished_at: new Date().toISOString(),
          status,
          stop_reason: stopReason,
          pages_fetched: pages,
          items_found: found,
          items_new: created,
          items_updated: updated,
          errors,
        })
        .eq("id", runId);
      await admin.from("collector_sources").update({ last_run_id: runId }).eq("key", sourceKey);
    }
    await admin.rpc("release_collector_source", { _key: sourceKey });
  }

  return {
    runId,
    source: sourceKey,
    status,
    stopReason,
    pagesFetched: pages,
    itemsFound: found,
    itemsNew: created,
    itemsUpdated: updated,
    errors,
  };
}
