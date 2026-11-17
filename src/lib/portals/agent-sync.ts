/**
 * RP2: la republicare, datele agentului responsabil se retransmit la portalurile
 * cu entitate de agent, o singură dată per lot + portal + agent.
 * Pur (dependențe injectate), fără apeluri de rețea proprii.
 */
import type { PublishApplyFn, PublishJobRow, PublishOutcome } from "./publish-jobs.server";

export type AgentSyncResult = { ok: true } | { ok: false; message: string };

export type AgentSyncDeps = {
  /** Sincronizatoare per portal; lipsa portalului = nimic de făcut (contact inline/feed). */
  syncers: Partial<Record<string, (job: PublishJobRow, agentId: string) => Promise<AgentSyncResult>>>;
  loadAgentIds: (job: PublishJobRow) => Promise<string[]>;
  log: (job: PublishJobRow, agentId: string, result: AgentSyncResult) => Promise<void>;
};

export const AGENT_SYNC_WARNING_PREFIX = "Datele agentului nu au putut fi actualizate la portal: ";

const cache = new Map<string, Promise<AgentSyncResult>>();
const CACHE_MAX = 2000;

export function resetAgentSyncCache() {
  cache.clear();
}

async function syncOnce(job: PublishJobRow, agentId: string, deps: AgentSyncDeps): Promise<AgentSyncResult> {
  const key = `${job.republish_batch_id}|${job.portal_key}|${agentId}`;
  let pending = cache.get(key);
  if (!pending) {
    if (cache.size >= CACHE_MAX) cache.clear();
    const syncer = deps.syncers[job.portal_key]!;
    pending = (async () => {
      let result: AgentSyncResult;
      try {
        result = await syncer(job, agentId);
      } catch (e) {
        result = { ok: false, message: e instanceof Error ? e.message.slice(0, 200) : "eroare necunoscută" };
      }
      try {
        await deps.log(job, agentId, result);
      } catch {
        /* jurnalul nu blochează */
      }
      return result;
    })();
    cache.set(key, pending);
  }
  return pending;
}

export async function withRepublishAgentSync(
  job: PublishJobRow,
  apply: PublishApplyFn,
  deps: AgentSyncDeps,
): Promise<PublishOutcome | null> {
  if (!job.republish_batch_id || !job.enabled || !deps.syncers[job.portal_key]) return apply(job);
  const warnings: string[] = [];
  let agentIds: string[] = [];
  try {
    agentIds = await deps.loadAgentIds(job);
  } catch {
    agentIds = [];
  }
  for (const agentId of agentIds) {
    const result = await syncOnce(job, agentId, deps);
    if (!result.ok) warnings.push(`${AGENT_SYNC_WARNING_PREFIX}${result.message}`);
  }
  const outcome = await apply(job);
  if (warnings.length === 0) return outcome;
  const warning = [...new Set(warnings)].join(" ");
  if (outcome === null) return { portalId: job.portal_key, ok: true, message: warning };
  if (!outcome.ok) return outcome;
  return { ...outcome, message: [outcome.message, warning].filter(Boolean).join(" ").slice(0, 500) };
}
