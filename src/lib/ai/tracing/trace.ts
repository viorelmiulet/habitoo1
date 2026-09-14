/**
 * Tracing AI (partea pură).
 *
 * Fiecare cerere primește un `traceId`. Pașii înregistrați permit
 * reconstituirea traseului: utilizator → agent → tool → Supabase → agent →
 * răspuns, cu latență și status, fără date sensibile și fără secrete.
 */

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

const SECRET_KEY = /(key|secret|token|password|apikey|authorization)/i;

/** Scoate orice câmp care ar putea conține un secret și scurtează textele. */
export function scrubTraceDetails(
  details: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!details) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (SECRET_KEY.test(key)) continue;
    if (typeof value === "string") {
      out[key] = value.length > 300 ? `${value.slice(0, 300)}…` : value;
      continue;
    }
    if (value === null || ["number", "boolean"].includes(typeof value)) {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.slice(0, 20).map((item) => (typeof item === "string" ? item : item));
      continue;
    }
    out[key] = value;
  }
  return out;
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
