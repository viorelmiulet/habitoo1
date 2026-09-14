/**
 * Persistarea trasării AI. Best-effort: o eroare de scriere nu poate strica
 * răspunsul utilizatorului.
 */
import type { AiTraceEvent } from "./trace";

type TraceRow = {
  organization_id: string;
  user_id: string | null;
  trace_id: string;
  run_id: string | null;
  kind: string;
  name: string;
  status: string;
  latency_ms: number | null;
  details: Record<string, unknown>;
};

export function toTraceRows(events: AiTraceEvent[]): TraceRow[] {
  return events.map((event) => ({
    organization_id: event.organizationId,
    user_id: event.userId,
    trace_id: event.traceId,
    run_id: event.runId,
    kind: event.kind,
    name: event.name,
    status: event.status,
    latency_ms: event.latencyMs,
    details: event.details,
  }));
}

export async function writeTraceEvents(events: AiTraceEvent[]): Promise<void> {
  if (events.length === 0) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("ai_trace_events")
      .insert(toTraceRows(events) as never);
    if (error) console.error("[ai] trace insert failed", error.message);
  } catch (error) {
    console.error("[ai] trace client unavailable", error);
  }
}
