/**
 * Tracing AI (partea pură).
 *
 * Fiecare cerere primește un `traceId`. Pașii înregistrați permit
 * reconstituirea traseului: utilizator → agent → tool → Supabase → agent →
 * răspuns, cu latență și status, fără date sensibile și fără secrete.
 */

import { isRedactedDetailKey } from "../security/redaction-keys";

export type AiTraceKind = "agent" | "workflow" | "step" | "tool" | "model" | "error";

export type AiTraceEvent = {
  traceId: string;
  organizationId: string;
  userId: string | null;
  runId: string | null;
  kind: AiTraceKind;
  name: string;
  status: "ok" | "failed";
  latencyMs: number | null;
  details: Record<string, unknown>;
};

const isSecretKey = isRedactedDetailKey;
const MAX_STRING = 300;
const MAX_DEPTH = 6;
const MAX_ITEMS = 20;

function scrubValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (value === null || ["number", "boolean"].includes(typeof value)) return value;
  if (depth >= MAX_DEPTH) return "[prea adânc]";
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ITEMS).map((item) => scrubValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (isSecretKey(key)) continue;
      out[key] = scrubValue(item, depth + 1);
    }
    return out;
  }
  return undefined;
}

/** Scoate recursiv orice câmp care ar putea conține un secret și scurtează textele. */
export function scrubTraceDetails(
  details: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!details) return {};
  return (scrubValue(details, 0) ?? {}) as Record<string, unknown>;
}


/** Colector de pași: acumulează în memorie, apoi se scrie o singură dată. */
export class AiTracer {
  private readonly events: AiTraceEvent[] = [];

  constructor(
    readonly traceId: string,
    private readonly base: { organizationId: string; userId: string | null; runId?: string | null },
  ) {}

  record(
    kind: AiTraceKind,
    name: string,
    options: {
      status?: "ok" | "failed";
      latencyMs?: number | null;
      details?: Record<string, unknown>;
    } = {},
  ): void {
    this.events.push({
      traceId: this.traceId,
      organizationId: this.base.organizationId,
      userId: this.base.userId,
      runId: this.base.runId ?? null,
      kind,
      name,
      status: options.status ?? "ok",
      latencyMs: options.latencyMs ?? null,
      details: scrubTraceDetails(options.details),
    });
  }

  /** Măsoară automat latența unui pas și înregistrează eșecul, dacă apare. */
  async span<T>(kind: AiTraceKind, name: string, run: () => Promise<T>): Promise<T> {
    const started = Date.now();
    try {
      const result = await run();
      this.record(kind, name, { latencyMs: Date.now() - started });
      return result;
    } catch (error) {
      this.record("error", name, {
        status: "failed",
        latencyMs: Date.now() - started,
        details: { kind, error: error instanceof Error ? error.name : "unknown" },
      });
      throw error;
    }
  }

  list(): AiTraceEvent[] {
    return [...this.events];
  }

  /** Rezumatul traseului, folosit în audit și în UI (indicator de context). */
  summary(): { steps: number; failed: number; path: string[] } {
    return {
      steps: this.events.length,
      failed: this.events.filter((event) => event.status === "failed").length,
      path: this.events.map((event) => `${event.kind}:${event.name}`),
    };
  }
}

export function newTraceId(): string {
  return crypto.randomUUID();
}
