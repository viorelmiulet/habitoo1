export type StatusTone = "success" | "warning" | "danger" | "neutral" | "primary";

export const ORG_STATUS_LABELS: Record<string, string> = {
  active: "Activă",
  trial: "În probă",
  suspended: "Suspendată",
  pending_approval: "În așteptare",
  cancelled: "Anulată",
};

/** Culorile etichetelor: Activ verde, În probă auriu, În așteptare portocaliu, Suspendat/Anulat roșu, Inactiv/arhivat gri. */
export function orgStatusBadge(org: { status: string; is_trial?: boolean | null; archived_at?: string | null }): { label: string; tone: StatusTone } {
  if (org.archived_at) return { label: "Arhivată", tone: "neutral" };
  if (org.status === "suspended" || org.status === "cancelled") return { label: ORG_STATUS_LABELS[org.status], tone: "danger" };
  if (org.status === "pending_approval") return { label: "În așteptare", tone: "warning" };
  if (org.status === "trial" || org.is_trial) return { label: "În probă", tone: "primary" };
  if (org.status === "active") return { label: "Activă", tone: "success" };
  return { label: ORG_STATUS_LABELS[org.status] ?? org.status, tone: "neutral" };
}

export function userStatusBadge(isActive: boolean): { label: string; tone: StatusTone } {
  return isActive ? { label: "Activ", tone: "success" } : { label: "Inactiv", tone: "neutral" };
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase();
}

/** Doar SuperAdmin intră în zona de administrare a platformei. */
export function canAccessSuperadmin(user: { isSuperadmin?: boolean } | null | undefined): boolean {
  return user?.isSuperadmin === true;
}

/**
 * Unde ajunge un utilizator când deschide `/app`.
 * Superadminul fără agenție (și care nu impersonează pe nimeni) nu are dashboard de
 * agenție, deci intră direct în panoul platformei. Toți ceilalți rămân pe `/app`.
 */
export function dashboardHomeFor(user: {
  isSuperadmin?: boolean;
  organization?: unknown;
  impersonation?: unknown;
}): "/superadmin" | "/app" {
  if (user.isSuperadmin && !user.organization && !user.impersonation) return "/superadmin";
  return "/app";
}
