/**
 * Jobul de îmbogățire AI a ofertelor de piață (server-only).
 *
 * Lot limitat per rulare, lease unic în baza de date, progres salvat pe
 * fiecare anunț, plafon lunar de cost și pauză persistentă la 402/403.
 */
import { resolveAiProvider } from "@/lib/ai/providers/registry.server";
import { withAiProviderFallback } from "@/lib/ai/providers/fallback.server";
import { withRetry } from "@/lib/ai/reliability/retry";
import { AiProviderError } from "@/lib/ai/providers/types";
import { writeAiUsage } from "@/lib/ai/usage/tracking.server";
import {
  ACP_ENRICH_BATCH_SIZE,
  ACP_ENRICH_CAPABILITY,
  ACP_ENRICH_MONTHLY_BUDGET_USD,
  ACP_ENRICH_PROMPT_VERSION,
  ACP_ENRICH_RESPONSE_SCHEMA,
  ACP_ENRICH_RUN_LIMITS,
  ACP_ENRICH_SYSTEM_PROMPT,
  ACP_ENRICH_SYSTEM_USER,
  enrichCostUsd,
  enrichInputHash,
  enrichmentRow,
  enrichPayload,
  parseEnrichResponse,
  type AcpEnrichItem,
  type EnrichInputListing,
} from "./enrichment";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/** Rezervă de cost pentru un apel, verificată înainte (un lot de 10 anunțuri). */
const PER_CALL_RESERVE_USD = 0.02;

export type AcpEnrichRunResult = {
  status: "ok" | "locked" | "paused" | "budget" | "unconfigured" | "idle" | "rate_limited" | "failed";
  processed: number;
  failed: number;
  costUsd: number;
  monthSpentUsd: number;
  calls: number;
  items: { id: string; item: AcpEnrichItem | null }[];
};

function monthStartIso(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit" })
    .formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  // Începutul lunii la București (aprox. UTC-2/3); o oră de diferență nu contează pentru plafon.
  return new Date(`${y}-${m}-01T00:00:00+02:00`).toISOString();
}

export async function acpEnrichMonthSpend(admin: Admin): Promise<number> {
  const { data } = await admin
    .from("ai_usage_events")
    .select("extra_info")
    .eq("capability", ACP_ENRICH_CAPABILITY)
    .gte("created_at", monthStartIso());
  return (data ?? []).reduce((sum, row) => {
    const cost = Number((row.extra_info as { cost_usd?: unknown } | null)?.cost_usd ?? 0);
    return sum + (Number.isFinite(cost) ? cost : 0);
  }, 0);
}

async function setPause(admin: Admin, reason: string | null) {
  await admin
    .from("acp_enrich_state")
    .update({ paused_reason: reason, paused_at: reason ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("id", "acp_enrich");
}

/** Un apel AI pentru un lot; întoarce rezultatele pe `ref`. */
async function enrichBatch(listings: EnrichInputListing[]) {
  const primary = resolveAiProvider();
  if (!primary) throw new AiProviderError("AI neconfigurat", 401);
  const refs = listings.map((_, i) => `a${i + 1}`);
  const user = `Extrage datele pentru fiecare anunț. Întoarce un obiect JSON {"anunturi": [...]} cu câte un element pentru fiecare ref, conform schemei: ${JSON.stringify(ACP_ENRICH_RESPONSE_SCHEMA)}\n\nAnunțuri:\n${JSON.stringify(listings.map((l, i) => enrichPayload(l, refs[i]!)))}`;
  const started = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let calls = 0;
  const completed = await withAiProviderFallback(primary, async (provider) => {
    inputTokens = 0;
    outputTokens = 0;
    calls = 0;
    let parsed = parseEnrichResponse("");
    // O singură corectare de format, distinctă de reîncercările de rețea.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const answer = await withRetry(() => {
        calls += 1;
        return provider.generate({
          system: ACP_ENRICH_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: attempt === 0 ? user : `${user}\nRăspunsul anterior nu a fost JSON valid. Întoarce acum exclusiv obiectul JSON.`,
            },
          ],
          tools: [],
        });
      });
      inputTokens += answer.inputTokens ?? 0;
      outputTokens += answer.outputTokens ?? 0;
      parsed = parseEnrichResponse(answer.text);
      if (parsed.ok) break;
    }
    return parsed;
  });
  const byId = new Map<string, AcpEnrichItem>();
  listings.forEach((l, i) => {
    const item = completed.result.items.get(refs[i]!);
    if (item) byId.set(l.id, item);
  });
  return {
    byId,
    provider: completed.provider.id,
    model: completed.provider.model,
    fallbackUsed: completed.fallbackUsed,
    inputTokens,
    outputTokens,
    calls,
    latencyMs: Date.now() - started,
    costUsd: enrichCostUsd(completed.provider.id, inputTokens, outputTokens),
  };
}

/**
 * Rulează un lot. `mode`: „new” (anunțuri noi, la 15 min) sau „backlog”
 * (restanța, noaptea). `listingIds` = test explicit pe anunțuri alese.
 */
export async function runAcpEnrichment(
  admin: Admin,
  options: { mode: "new" | "backlog"; limit?: number; listingIds?: string[] },
): Promise<AcpEnrichRunResult> {
  const result: AcpEnrichRunResult = { status: "ok", processed: 0, failed: 0, costUsd: 0, monthSpentUsd: 0, calls: 0, items: [] };
  if (!resolveAiProvider()) return { ...result, status: "unconfigured" };

  const owner = crypto.randomUUID();
  const { data: acquired } = await admin.rpc("acp_enrich_acquire", { _owner: owner, _ttl_seconds: 600 });
  if (acquired !== true) return { ...result, status: "locked" };
  try {
    const { data: state } = await admin.from("acp_enrich_state").select("paused_reason").eq("id", "acp_enrich").maybeSingle();
    const paused = state?.paused_reason ?? null;
    let limit = Math.min(options.limit ?? ACP_ENRICH_RUN_LIMITS[options.mode], 100);
    // În pauză (credite/acces): cel mult o probă de un anunț pe rulare.
    if (paused) limit = 1;

    let listings: EnrichInputListing[];
    if (options.listingIds?.length) {
      const { data } = await admin.from("market_listings").select("*").in("id", options.listingIds.slice(0, 100));
      listings = (data ?? []) as unknown as EnrichInputListing[];
    } else {
      const { data } = await admin.rpc("acp_enrich_pending", { _limit: limit, _newest: options.mode === "new" });
      listings = (data ?? []) as unknown as EnrichInputListing[];
    }
    listings = listings.slice(0, limit === 1 ? 1 : listings.length);
    if (listings.length === 0) return { ...result, status: "idle" };

    result.monthSpentUsd = await acpEnrichMonthSpend(admin);
    let rateLimited = 0;
    for (let i = 0; i < listings.length; i += ACP_ENRICH_BATCH_SIZE) {
      if (result.monthSpentUsd + result.costUsd + PER_CALL_RESERVE_USD > ACP_ENRICH_MONTHLY_BUDGET_USD) {
        result.status = "budget";
        break;
      }
      const batch = listings.slice(i, i + ACP_ENRICH_BATCH_SIZE);
      try {
        const out = await enrichBatch(batch);
        result.calls += out.calls;
        result.costUsd += out.costUsd;
        await writeAiUsage(admin as never, {
          organization_id: null as never,
          user_id: ACP_ENRICH_SYSTEM_USER,
          provider: out.provider,
          model: out.model,
          capability: ACP_ENRICH_CAPABILITY,
          input_tokens: out.inputTokens || null,
          output_tokens: out.outputTokens || null,
          latency_ms: out.latencyMs,
          success: out.byId.size > 0,
          tool_calls: 0,
          fallback_used: out.fallbackUsed,
          extra_info: { cost_usd: Number(out.costUsd.toFixed(6)), listings: batch.length, extracted: out.byId.size, prompt_version: ACP_ENRICH_PROMPT_VERSION },
        } as never);
        const perListingCost = out.costUsd / batch.length;
        const now = new Date().toISOString();
        const rows = batch.map((listing) => {
          const item = out.byId.get(listing.id) ?? null;
          result.items.push({ id: listing.id, item });
          if (item) result.processed += 1;
          else result.failed += 1;
          return {
            market_listing_id: listing.id,
            status: item ? "ok" : "failed",
            input_hash: enrichInputHash(listing),
            provider: out.provider,
            model: out.model,
            prompt_version: ACP_ENRICH_PROMPT_VERSION,
            enriched_at: now,
            error_code: item ? null : "invalid_output",
            cost_usd: Number(perListingCost.toFixed(6)),
            ...(item ? enrichmentRow(item) : {}),
          };
        });
        // Încercările eșuate se numără, ca un anunț problematic să nu se reia la nesfârșit.
        const { data: existing } = await admin
          .from("market_listing_enrichments")
          .select("market_listing_id,attempts")
          .in("market_listing_id", batch.map((l) => l.id));
        const attempts = new Map((existing ?? []).map((r) => [r.market_listing_id, r.attempts]));
        await admin
          .from("market_listing_enrichments")
          .upsert(rows.map((r) => ({ ...r, attempts: (attempts.get(r.market_listing_id) ?? 0) + 1 })) as never, { onConflict: "market_listing_id" });
        if (paused) await setPause(admin, null);
      } catch (error) {
        const status = error instanceof AiProviderError ? error.status : undefined;
        await writeAiUsage(admin as never, {
          organization_id: null as never,
          user_id: ACP_ENRICH_SYSTEM_USER,
          provider: "unknown",
          model: "unknown",
          capability: ACP_ENRICH_CAPABILITY,
          input_tokens: null,
          output_tokens: null,
          latency_ms: 0,
          success: false,
          tool_calls: 0,
          extra_info: { error_status: status ?? null, listings: batch.length, cost_usd: 0 },
        } as never);
        if (status === 402 || status === 403 || status === 401) {
          await setPause(admin, `provider_${status}`);
          result.status = "paused";
          break;
        }
        if (status === 429) {
          rateLimited += 1;
          if (rateLimited >= 2) {
            result.status = "rate_limited";
            break;
          }
          continue;
        }
        result.failed += batch.length;
        result.status = "failed";
        break;
      }
    }
    return result;
  } finally {
    await admin.rpc("acp_enrich_release", { _owner: owner });
  }
}
