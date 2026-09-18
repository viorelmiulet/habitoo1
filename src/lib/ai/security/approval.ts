/**
 * Integritatea aprobărilor AI — partea pură, comună tuturor agenților.
 *
 * Două garanții:
 *  1. o aprobare se consumă ATOMIC: `claimSuspendedRun` trece rularea din
 *     `suspended` în `running` printr-un update condiționat, deci două cereri
 *     paralele nu pot executa aceeași acțiune de două ori;
 *  2. argumentele aprobate sunt AMPRENTATE la suspendare și verificate la
 *     reluare.
 *
 * Cât valoare are amprenta, exact: ea detectează o modificare accidentală sau
 * parțială a stării (o scriere care schimbă argumentele fără să recalculeze
 * amprenta, o stare veche reluată, o serializare stricată). NU este o
 * semnătură: cine poate scrie în `ai_workflow_runs.state` poate recalcula
 * amprenta cu aceeași funcție pură și deci o poate potrivi. Garanția reală
 * împotriva unui astfel de scriitor rămâne RLS plus faptul că
 * `approvalGranted` se stabilește doar în codul serverului.
 *
 * `claimedRunIsStale` / `releaseClaimedRun` împiedică a doua problemă a
 * preluării atomice: o rulare preluată care eșuează înainte de a fi persistată
 * ar rămâne „running" pentru totdeauna, iar utilizatorul nu ar mai putea decide.
 */

export const APPROVAL_ALREADY_APPLIED = "Această decizie a fost deja aplicată.";
export const APPROVAL_TAMPERED =
  "Propunerea aprobată a fost modificată între timp, așa că nu am executat nimic. Cere aprobarea din nou.";


function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}

/**
 * Amprenta argumentelor aprobate. Ordinea cheilor nu contează: doar conținutul.
 */
export function argumentsFingerprint(argumentsJson: string): string {
  let normalized = argumentsJson;
  try {
    normalized = stableStringify(JSON.parse(argumentsJson));
  } catch {
    normalized = argumentsJson;
  }
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < normalized.length; i += 1) {
    const code = normalized.charCodeAt(i);
    h1 = (h1 ^ code) * 0x01000193;
    h2 = (h2 + code * (i + 1)) >>> 0;
  }
  const a = (h1 >>> 0).toString(16).padStart(8, "0");
  const b = (h2 >>> 0).toString(16).padStart(8, "0");
  return `${a}${b}`;
}

/** `true` când amprenta lipsește (rulare veche) sau corespunde argumentelor. */
export function fingerprintMatches(
  expected: string | null | undefined,
  argumentsJson: string,
): boolean {
  if (!expected) return true;
  return expected === argumentsFingerprint(argumentsJson);
}

type QueryLike = {
  update: (values: Record<string, unknown>) => QueryLike;
  eq: (column: string, value: unknown) => QueryLike;
  lt: (column: string, value: unknown) => QueryLike;
  select: (columns: string) => QueryLike;
  maybeSingle: () => Promise<{ data: unknown; error?: unknown }>;
};

type AdminLike = { from: (table: string) => unknown };

/** Lease-ul unei rulări preluate: după atât timp poate fi preluată din nou. */
export const RUN_CLAIM_LEASE_MS = 10 * 60 * 1000;

type ClaimParams = {
  runId: string;
  organizationId: string;
  userId: string;
  workflow?: string;
  columns: string;
};

function claimQuery(admin: AdminLike, params: ClaimParams, claimedAt: string): QueryLike {
  let query = (admin.from("ai_workflow_runs") as QueryLike)
    .update({ status: "running", claimed_at: claimedAt, updated_at: claimedAt })
    .eq("id", params.runId)
    .eq("organization_id", params.organizationId)
    .eq("user_id", params.userId);
  if (params.workflow) query = query.eq("workflow", params.workflow);
  return query;
}

/**
 * Consumă aprobarea atomic: `update … where status='suspended' returning *`.
 * Întoarce rândul doar dacă exact această cerere a preluat rularea suspendată.
 *
 * Al doilea update recuperează o rulare rămasă blocată: dacă a fost preluată
 * acum mai mult de `RUN_CLAIM_LEASE_MS` și nu a fost persistată niciodată,
 * lease-ul a expirat și decizia poate fi luată din nou.
 */
export async function claimSuspendedRun<T = Record<string, unknown>>(
  admin: AdminLike,
  params: ClaimParams,
): Promise<T | null> {
  const now = new Date();
  const claimedAt = now.toISOString();
  const { data } = await claimQuery(admin, params, claimedAt)
    .eq("status", "suspended")
    .select(params.columns)
    .maybeSingle();
  if (data) return data as T;

  const cutoff = new Date(now.getTime() - RUN_CLAIM_LEASE_MS).toISOString();
  const { data: stale } = await claimQuery(admin, params, claimedAt)
    .eq("status", "running")
    .lt("claimed_at", cutoff)
    .select(params.columns)
    .maybeSingle();
  return (stale as T | null) ?? null;
}

/**
 * Eliberează o rulare preluată: o readuce în `suspended` ca utilizatorul să
 * poată decide din nou. Se apelează când reluarea eșuează neaștepatat.
 */
export async function releaseClaimedRun(
  admin: AdminLike,
  params: { runId: string; organizationId: string; userId: string },
): Promise<void> {
  await (admin.from("ai_workflow_runs") as QueryLike)
    .update({ status: "suspended", claimed_at: null, updated_at: new Date().toISOString() })
    .eq("id", params.runId)
    .eq("organization_id", params.organizationId)
    .eq("user_id", params.userId)
    .eq("status", "running")
    .select("id")
    .maybeSingle();
}

