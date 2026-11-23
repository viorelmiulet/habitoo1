/** Rapoarte rămase în „generating” (proces oprit în timpul randării). */
export const REPORT_STALE_AFTER_MS = 10 * 60_000;
export const REPORT_STALE_MESSAGE = "Generarea raportului a fost întreruptă. Încearcă din nou.";

export function isStaleGeneratingReport(
  row: { status?: string | null; created_at?: string | null },
  now: number = Date.now(),
): boolean {
  if (row.status !== "generating" || !row.created_at) return false;
  const created = Date.parse(row.created_at);
  return Number.isFinite(created) && now - created > REPORT_STALE_AFTER_MS;
}

/** Pragul ISO: rândurile `generating` create înainte de el sunt întrerupte. */
export function staleReportCutoff(now: number = Date.now()): string {
  return new Date(now - REPORT_STALE_AFTER_MS).toISOString();
}

type StaleUpdater = {
  from: (table: "acp_reports") => {
    update: (v: { status: "failed"; error_message: string }) => {
      eq: (c: "organization_id", v: string) => {
        eq: (c: "status", v: "generating") => { lt: (c: "created_at", v: string) => PromiseLike<{ error: unknown }> };
      };
    };
  };
};

/** Marchează `failed` rapoartele întrerupte ale agenției. Fail-open. */
export async function failStaleReports(admin: unknown, organizationId: string, now: number = Date.now()): Promise<void> {
  try {
    await (admin as StaleUpdater)
      .from("acp_reports")
      .update({ status: "failed", error_message: REPORT_STALE_MESSAGE })
      .eq("organization_id", organizationId)
      .eq("status", "generating")
      .lt("created_at", staleReportCutoff(now));
  } catch {
    /* listarea continuă */
  }
}
