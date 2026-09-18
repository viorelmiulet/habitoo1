/**
 * Integritatea aprobărilor AI — partea pură, comună tuturor agenților.
 *
 * Două garanții:
 *  1. o aprobare se consumă ATOMIC: `claimSuspendedRun` trece rularea din
 *     `suspended` în `running` printr-un update condiționat, deci două cereri
 *     paralele nu pot executa aceeași acțiune de două ori;
 *  2. argumentele aprobate sunt AMPRENTATE la suspendare și verificate la
 *     reluare, deci o scriere ulterioară în `ai_workflow_runs.state` nu poate
 *     schimba pe furiș ce se execută.
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
  select: (columns: string) => QueryLike;
  maybeSingle: () => Promise<{ data: unknown; error?: unknown }>;
};

type AdminLike = { from: (table: string) => unknown };

/**
 * Consumă aprobarea atomic: `update … where status='suspended' returning *`.
 * Întoarce rândul doar dacă exact această cerere a preluat rularea suspendată.
 */
export async function claimSuspendedRun<T = Record<string, unknown>>(
  admin: AdminLike,
  params: {
    runId: string;
    organizationId: string;
    userId: string;
    workflow?: string;
    columns: string;
  },
): Promise<T | null> {
  let query = (admin.from("ai_workflow_runs") as QueryLike)
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", params.runId)
    .eq("organization_id", params.organizationId)
    .eq("user_id", params.userId)
    .eq("status", "suspended");
  if (params.workflow) query = query.eq("workflow", params.workflow);
  const { data } = await query.select(params.columns).maybeSingle();
  return (data as T | null) ?? null;
}
