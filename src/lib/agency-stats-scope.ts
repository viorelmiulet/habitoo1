/** One declarative rule drives both the browser decision and the migration SQL. */
export const AGENCY_INACTIVITY_RULE = {
  statuses: { suspended: "Suspendată", cancelled: "Anulată" },
  expirationField: "subscription_expires_at",
} as const;

export type AgencyInactiveReason = "suspended" | "cancelled" | "expired";
export type AgencyStatsScope = "active" | "inactive";
export type AgencyAccessState = {
  status: string; subscription_expires_at: string | null;
  archived_at?: string | null; is_demo?: boolean | null;
};

export function agencyInactiveReason(org: AgencyAccessState, now = Date.now()): AgencyInactiveReason | null {
  for (const status of Object.keys(AGENCY_INACTIVITY_RULE.statuses) as ("suspended" | "cancelled")[]) {
    if (org.status === status) return status;
  }
  const expiry = org[AGENCY_INACTIVITY_RULE.expirationField];
  return expiry && Date.parse(expiry) < now ? "expired" : null;
}

export function agencyInactiveLabel(reason: AgencyInactiveReason): string {
  return reason === "expired" ? "Expirată" : AGENCY_INACTIVITY_RULE.statuses[reason];
}

export function agenciesInScope<T extends AgencyAccessState>(orgs: T[], scope: AgencyStatsScope = "active", includeDemo = false, now = Date.now()): T[] {
  return orgs.filter((o) => !o.archived_at && (includeDemo || !o.is_demo) &&
    (agencyInactiveReason(o, now) !== null) === (scope === "inactive"));
}

/** Generated migration fragment; no separate handwritten SQL expiration rule. */
export function agencyInactivitySql(): string {
  const cases = Object.keys(AGENCY_INACTIVITY_RULE.statuses).map((s) => `when _status = '${s}' then '${s}'`).join("\n    ");
  return `create or replace function public.agency_stats_inactive_reason(_status text, _${AGENCY_INACTIVITY_RULE.expirationField} timestamptz, _now timestamptz default now())
returns text language sql stable set search_path = public as $$
  select case ${cases}
    when _${AGENCY_INACTIVITY_RULE.expirationField} < _now then 'expired'
    else null end;
$$;`;
}