/**
 * Clientul Apify — server-only.
 *
 * Tokenul se citește din `process.env['APIFY_TOKEN']` în interiorul apelurilor
 * și nu ajunge niciodată în browser: server functions returnează doar cifre și
 * texte, niciodată configurația de autentificare.
 *
 * Endpointuri folosite (API Apify v2):
 *  - POST /v2/acts/{actorId}/runs               — pornește rularea
 *  - GET  /v2/actor-runs/{runId}                — starea și consumul rulării
 *  - GET  /v2/datasets/{datasetId}/items        — rezultatele, paginat
 */

const APIFY_BASE = "https://api.apify.com/v2";

/** Buget de așteptare pentru o rulare pornită manual. */
export const APIFY_POLL_BUDGET_MS = 240_000;
export const APIFY_POLL_MIN_MS = 2_000;
export const APIFY_POLL_MAX_MS = 10_000;
export const APIFY_PAGE_SIZE = 250;

export const APIFY_TOKEN_MISSING =
  "Tokenul Apify nu este configurat. Adaugă-l în Setări proiect → Secrets, ca APIFY_TOKEN.";

export type ApifyRunStatus =
  | "READY"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "ABORTING"
  | "ABORTED"
  | "TIMING-OUT"
  | "TIMED-OUT";

export type ApifyRunInfo = {
  id: string;
  status: ApifyRunStatus;
  datasetId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  /** Costul real raportat de Apify, în USD. */
  costUsd: number | null;
  usage: Record<string, unknown> | null;
};

export function apifyTokenConfigured(): boolean {
  const token = process.env["APIFY_TOKEN"];
  return typeof token === "string" && token.trim() !== "";
}

function requireToken(): string {
  const token = process.env["APIFY_TOKEN"];
  if (typeof token !== "string" || token.trim() === "") throw new Error(APIFY_TOKEN_MISSING);
  return token.trim();
}

async function apifyFetch(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown } = { method: "GET" },
): Promise<unknown> {
  const token = requireToken();
  const response = await fetch(`${APIFY_BASE}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  if (!response.ok) {
    // Mesajul Apify este util; tokenul nu apare în el.
    throw new Error(`Apify a răspuns ${response.status}: ${text.slice(0, 500)}`);
  }
  return text === "" ? null : JSON.parse(text);
}

function runInfo(payload: unknown): ApifyRunInfo {
  const data = ((payload as { data?: unknown })?.data ?? payload) as Record<string, unknown>;
  const stats = (data["usage"] ?? null) as Record<string, unknown> | null;
  const total = data["usageTotalUsd"];
  return {
    id: String(data["id"] ?? ""),
    status: String(data["status"] ?? "RUNNING") as ApifyRunStatus,
    datasetId: (data["defaultDatasetId"] as string | undefined) ?? null,
    startedAt: (data["startedAt"] as string | undefined) ?? null,
    finishedAt: (data["finishedAt"] as string | undefined) ?? null,
    costUsd: typeof total === "number" && Number.isFinite(total) ? total : null,
    usage: stats,
  };
}

export function isTerminalApifyStatus(status: ApifyRunStatus): boolean {
  return (
    status === "SUCCEEDED" || status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT"
  );
}

/** Pornește rularea actorului cu inputul stocat pe sursă. */
export async function startApifyRun(input: {
  actorId: string;
  input: Record<string, unknown>;
  maxItems: number;
}): Promise<ApifyRunInfo> {
  const actor = encodeURIComponent(input.actorId);
  const payload = await apifyFetch(`/acts/${actor}/runs?maxItems=${input.maxItems}`, {
    method: "POST",
    body: input.input,
  });
  return runInfo(payload);
}

export async function getApifyRunInfo(runId: string): Promise<ApifyRunInfo> {
  return runInfo(await apifyFetch(`/actor-runs/${encodeURIComponent(runId)}`));
}

export type ApifyPollResult = { info: ApifyRunInfo; timedOut: boolean };

/** Așteaptă până la o stare terminală, cu backoff și buget de timp. */
export async function waitForApifyRun(
  runId: string,
  options: {
    budgetMs?: number;
    sleep?: (ms: number) => Promise<void>;
    read?: (runId: string) => Promise<ApifyRunInfo>;
  } = {},
): Promise<ApifyPollResult> {
  const budget = options.budgetMs ?? APIFY_POLL_BUDGET_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const read = options.read ?? getApifyRunInfo;
  const deadline = Date.now() + budget;
  let delay = APIFY_POLL_MIN_MS;
  let info = await read(runId);
  while (!isTerminalApifyStatus(info.status)) {
    if (Date.now() + delay > deadline) return { info, timedOut: true };
    await sleep(delay);
    delay = Math.min(Math.round(delay * 1.5), APIFY_POLL_MAX_MS);
    info = await read(runId);
  }
  return { info, timedOut: false };
}

/** Citește rezultatele din dataset, paginat, plafonat la `maxItems`. */
export async function readApifyDataset(input: {
  datasetId: string;
  maxItems: number;
  fetchPage?: (offset: number, limit: number) => Promise<unknown[]>;
}): Promise<unknown[]> {
  const fetchPage =
    input.fetchPage ??
    (async (offset: number, limit: number) => {
      const payload = await apifyFetch(
        `/datasets/${encodeURIComponent(input.datasetId)}/items?clean=true&offset=${offset}&limit=${limit}`,
      );
      return Array.isArray(payload) ? payload : [];
    });

  const items: unknown[] = [];
  let offset = 0;
  while (items.length < input.maxItems) {
    const limit = Math.min(APIFY_PAGE_SIZE, input.maxItems - items.length);
    const page = await fetchPage(offset, limit);
    items.push(...page);
    if (page.length < limit) break;
    offset += page.length;
  }
  return items.slice(0, input.maxItems);
}
