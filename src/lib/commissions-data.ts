import { supabase } from "@/integrations/supabase/client";
import { ensureCommissionRates } from "./commissions-rates.functions";
import type { Tables } from "@/integrations/supabase/types";

export type CommissionRecord = Tables<"commissions">;
export type CommissionFilters = { from: string; to: string; agent: string; kind: string; ptype: string; status: string };
export function filterCommissionRows<T extends CommissionRecord>(rows: T[], filters: CommissionFilters, scope: { orgId: string; userId: string; isAdmin: boolean }): T[] {
  return rows.filter(r => r.organization_id === scope.orgId && (scope.isAdmin ? filters.agent === "__all" || r.agent_id === filters.agent : r.agent_id === scope.userId)
    && (!filters.from || r.transaction_date >= filters.from) && (!filters.to || r.transaction_date <= filters.to)
    && (filters.kind === "__all" || r.transaction_kind === filters.kind)
    && (filters.ptype === "__all" || r.property_type === filters.ptype)
    && (filters.status === "__all" || r.status === filters.status));
}

/** Complete ordered pagination, under the caller's existing RLS. */
export async function readCommissions(filters: CommissionFilters, scope: { orgId: string; userId: string; isAdmin: boolean }) {
  const rows: CommissionRecord[] = [];
  for (let offset = 0; ; offset += 500) {
    let q = supabase.from("commissions").select("*").eq("organization_id", scope.orgId)
      .order("transaction_date", { ascending: false }).order("id").range(offset, offset + 499);
    if (!scope.isAdmin) q = q.eq("agent_id", scope.userId);
    else if (filters.agent !== "__all") q = q.eq("agent_id", filters.agent);
    if (filters.from) q = q.gte("transaction_date", filters.from);
    if (filters.to) q = q.lte("transaction_date", filters.to);
    if (filters.kind !== "__all") q = q.eq("transaction_kind", filters.kind as "sale" | "rent");
    if (filters.ptype !== "__all") q = q.eq("property_type", filters.ptype);
    if (filters.status !== "__all") q = q.eq("status", filters.status);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 500) break;
  }
  const missing = rows.filter(r => !r.ron_to_eur_rate).map(r => r.id);
  for (let i = 0; i < missing.length; i += 100) {
    // A BNR outage or failed retry must not hide the saved list/report rows.
    const rates = await ensureCommissionRates({ data: { ids: missing.slice(i, i + 100) } }).catch(() => []);
    const byId = new Map(rates.map(r => [r.id, r.ron_to_eur_rate]));
    for (const row of rows) if (byId.has(row.id)) row.ron_to_eur_rate = byId.get(row.id) ?? null;
  }
  return filterCommissionRows(rows, filters, scope);
}