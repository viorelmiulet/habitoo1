/**
 * Jurnalul operațiilor cu portalurile (Superadmin): filtre, perioade și
 * mascarea secretelor din răspunsul portalului. Pur, partajat client/server.
 */
import { z } from "zod";

export const PORTAL_LOGS_PAGE_SIZE = 50;

export const PORTAL_LOG_PERIODS = ["today", "7d", "30d"] as const;
export type PortalLogPeriod = (typeof PORTAL_LOG_PERIODS)[number];

export const portalLogsFilterSchema = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  organizationId: z.string().uuid().optional(),
  portal: z.string().min(1).max(40).optional(),
  operation: z.string().min(1).max(60).optional(),
  status: z.enum(["success", "error"]).optional(),
  period: z.enum(PORTAL_LOG_PERIODS).optional(),
  reference: z.string().trim().min(1).max(60).optional(),
});
export type PortalLogsFilter = z.infer<typeof portalLogsFilterSchema>;

/** Începutul perioadei (ISO). „Azi” = de la miezul nopții UTC. */
export function periodStart(period: PortalLogPeriod, now: Date = new Date()): string {
  if (period === "today") {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  }
  const days = period === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

const SECRET_KEY =
  /(authorization|api[_-]?key|apikey|token|secret|password|passwd|credential|cookie|signature|client[_-]?secret|bearer|session|private[_-]?key|x-api)/i;
const SECRET_VALUE =
  /(bearer\s+[a-z0-9._~+/=-]+|basic\s+[a-z0-9+/=]{8,}|eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]+|sk_(live|test)_[a-z0-9]+|sb_secret_[a-z0-9_]+)/gi;
export const MASK = "••••••";

/** Maschează recursiv cheile sensibile și valorile care arată a token. */
export function maskSecrets(value: unknown, depth = 0): unknown {
  if (depth > 12) return MASK;
  if (typeof value === "string") return value.replace(SECRET_VALUE, MASK);
  if (Array.isArray(value)) return value.map((v) => maskSecrets(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? MASK : maskSecrets(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Rezumat scurt pentru coloana „Detalii”. */
export function logSummary(row: {
  success: boolean;
  error_message: string | null;
  error_code: string | null;
  http_status: number | null;
  external_id: string | null;
}): string {
  if (!row.success) {
    const msg = row.error_message ?? row.error_code ?? "Eroare";
    return String(maskSecrets(msg)).slice(0, 160);
  }
  const parts = [
    row.http_status ? `HTTP ${row.http_status}` : null,
    row.external_id ? `ID portal ${row.external_id}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Reușit";
}
