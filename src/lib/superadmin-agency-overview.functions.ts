/**
 * Pagina Superadmin „Stare agenții”: vedere de ansamblu read-only cu planul,
 * locurile ocupate și istoricul schimbărilor fiecărei agenții. O singură
 * funcție server-side, exclusiv pentru superadmin, cu agregări în memorie
 * (fără N+1) — datele se citesc o dată și se grupează pe agenție.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AuthContext = {
  supabase: {
    rpc: (
      fn: "is_superadmin",
    ) => PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
  };
};

async function assertSuperadmin(context: AuthContext) {
  const { data, error } = await context.supabase.rpc("is_superadmin");
  if (error || data !== true) {
    throw new Error("Acces refuzat: acțiunea este permisă exclusiv superadminului.");
  }
}

export type AgencyOverviewRow = {
  id: string;
  name: string;
  city: string | null;
  status: string;
  plan: string;
  subscriptionTerm: string | null;
  subscriptionExpiresAt: string | null;
  isTrial: boolean;
  archivedAt: string | null;
  createdAt: string;
  seatsUsed: number;
};

/** Valori jurnalizate în audit, restrânse la primitive JSON serializabile. */
export type AuditValues = Record<string, string | number | boolean | null> | null;

export type AgencyHistoryEntry = {
  id: string;
  action: string;
  createdAt: string;
  actorName: string | null;
  oldValues: AuditValues;
  newValues: AuditValues;
};

export type AgencyOverview = {
  agencies: AgencyOverviewRow[];
  /** Istoricul schimbărilor, grupat pe agenție (cheie = id agenție). */
  historyByAgency: Record<string, AgencyHistoryEntry[]>;
};

export const getAgencyOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AgencyOverview> => {
    await assertSuperadmin(context as AuthContext);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");

    const [orgs, profiles, audit] = await Promise.all([
      admin
        .from("organizations")
        .select(
          "id,name,city,status,plan,subscription_term,subscription_expires_at,is_trial,archived_at,created_at",
        )
        .order("name", { ascending: true }),
      admin.from("profiles").select("id,organization_id,is_active"),
      // Istoricul agențiilor: toate acțiunile „organization.*” plus crearea.
      admin
        .from("audit_logs")
        .select("id,action,created_at,actor_id,organization_id,old_values,new_values")
        .or("action.like.organization.%,action.eq.agency.created")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    const failures = (
      [
        ["agenții", orgs],
        ["utilizatori", profiles],
        ["jurnal audit", audit],
      ] as [string, { error: { message: string } | null }][]
    )
      .filter(([, r]) => r.error)
      .map(([label, r]) => `${label}: ${r.error?.message}`);
    if (failures.length > 0) {
      console.error("[agency-overview] query failures", failures);
      throw new Error(`Interogările au eșuat — ${failures.join(" | ")}`);
    }

    const seatsByOrg = new Map<string, number>();
    for (const p of profiles.data ?? []) {
      if (!p.is_active || !p.organization_id) continue;
      seatsByOrg.set(p.organization_id, (seatsByOrg.get(p.organization_id) ?? 0) + 1);
    }

    const actorIds = [
      ...new Set((audit.data ?? []).map((a) => a.actor_id).filter(Boolean)),
    ] as string[];
    const actorName = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: actors } = await admin
        .from("profiles")
        .select("id,full_name")
        .in("id", actorIds);
      for (const p of actors ?? []) actorName.set(p.id, p.full_name);
    }

    const historyByAgency: Record<string, AgencyHistoryEntry[]> = {};
    for (const a of audit.data ?? []) {
      if (!a.organization_id) continue;
      const list = historyByAgency[a.organization_id] ?? [];
      list.push({
        id: a.id,
        action: a.action,
        createdAt: a.created_at,
        actorName: a.actor_id ? (actorName.get(a.actor_id) ?? null) : null,
        oldValues: (a.old_values as AuditValues) ?? null,
        newValues: (a.new_values as AuditValues) ?? null,
      });
      historyByAgency[a.organization_id] = list;
    }

    return {
      agencies: (orgs.data ?? []).map((o) => ({
        id: o.id,
        name: o.name,
        city: o.city,
        status: o.status,
        plan: o.plan,
        subscriptionTerm: o.subscription_term,
        subscriptionExpiresAt: o.subscription_expires_at,
        isTrial: o.is_trial ?? false,
        archivedAt: o.archived_at,
        createdAt: o.created_at,
        seatsUsed: seatsByOrg.get(o.id) ?? 0,
      })),
      historyByAgency,
    };
  });
