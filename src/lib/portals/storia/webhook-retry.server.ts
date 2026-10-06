/**
 * Reprocesarea notificărilor Storia eșuate (`processed = false`, semnătură
 * validă, sub 5 încercări, cu `next_attempt_at` ajuns la scadență).
 * Rulată de cron-ul armat la eșec; se dezarmează singur când coada se golește.
 */
import { STORIA_MAX_ATTEMPTS } from "./notifications.server";

export type RetryRow = {
  id: string;
  parsed_payload: unknown;
  attempts: number;
  next_attempt_at: string | null;
  received_at: string;
};

/** Primul pas: procesarea după răspuns are 2 minute înainte să fie preluată de cron. */
export const FIRST_PICKUP_MS = 2 * 60_000;

export function isRetryDue(row: RetryRow, nowMs: number): boolean {
  if (row.attempts >= STORIA_MAX_ATTEMPTS) return false;
  const due = row.next_attempt_at
    ? Date.parse(row.next_attempt_at)
    : Date.parse(row.received_at) + FIRST_PICKUP_MS;
  return Number.isFinite(due) && due <= nowMs;
}

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];
type Processor = (args: { eventId: string; parsed: unknown; attempts: number }) => Promise<{
  processed: boolean;
}>;

export async function runStoriaWebhookRetry(
  admin: Admin,
  process: Processor,
  opts: { maxItems: number; budgetMs: number },
): Promise<{ attempted: number; succeeded: number }> {
  const started = Date.now();
  const { data } = await admin
    .from("portal_webhook_events")
    .select("id, parsed_payload, attempts, next_attempt_at, received_at")
    .eq("portal", "storia")
    .eq("processed", false)
    .eq("signature_valid", true)
    .lt("attempts", STORIA_MAX_ATTEMPTS)
    .order("received_at", { ascending: true })
    .limit(opts.maxItems * 4);

  const due = ((data ?? []) as RetryRow[])
    .filter((row) => isRetryDue(row, started))
    .slice(0, opts.maxItems);

  let succeeded = 0;
  for (const row of due) {
    if (Date.now() - started > opts.budgetMs) break;
    const result = await process({ eventId: row.id, parsed: row.parsed_payload, attempts: row.attempts });
    if (result.processed) succeeded += 1;
  }
  return { attempted: due.length, succeeded };
}
