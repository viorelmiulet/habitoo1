import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Users, Layers, ShieldCheck, History } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { KpiCard } from "@/components/app/KpiCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { QueryError } from "@/components/app/QueryError";
import { ListSkeleton } from "@/components/app/LoadingState";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import {
  auditActionLabel,
  auditEntityLabels,
  organizationPlanLabels,
  organizationStatusLabels,
  organizationStatusTone,
} from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/superadmin/")({
  component: SuperadminDashboard,
});

function SuperadminDashboard() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["superadmin", "overview"],
    queryFn: async () => {
      const [orgs, profiles, properties, leads, audit] = await Promise.all([
        supabase.from("organizations").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id,organization_id,is_active"),
        supabase.from("properties").select("id,organization_id"),
        supabase.from("leads").select("id,organization_id"),
        supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(10),
      ]);
      const failed = [orgs, profiles, properties, leads, audit].find((r) => r.error);
      if (failed?.error) throw failed.error;
      return {
        orgs: orgs.data ?? [],
        profiles: profiles.data ?? [],
        properties: properties.data ?? [],
        leads: leads.data ?? [],
        audit: audit.data ?? [],
      };
    },
  });

  const orgs = data?.orgs ?? [];
  const audit = data?.audit ?? [];
  const activeOrgs = orgs.filter((o) => o.status === "active").length;
  const activeUsers = data?.profiles.filter((p) => p.is_active).length ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Platformă"
        title="Administrare platformă"
        description="Toate agențiile, utilizatorii și activitatea din platformă."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Agenții"
          value={orgs.length}
          hint={`${activeOrgs} active`}
          icon={Building2}
          to="/superadmin/agencies"
          loading={isLoading}
        />
        <KpiCard
          label="Utilizatori"
          value={data?.profiles.length ?? 0}
          hint={`${activeUsers} activi`}
          icon={Users}
          tone="accent"
          to="/superadmin/users"
          loading={isLoading}
        />
        <KpiCard
          label="Proprietăți"
          value={data?.properties.length ?? 0}
          hint="în toate agențiile"
          icon={Layers}
          tone="info"
          loading={isLoading}
        />
        <KpiCard
          label="Lead-uri"
          value={data?.leads.length ?? 0}
          hint="în toate agențiile"
          icon={ShieldCheck}
          tone="success"
          loading={isLoading}
        />
      </div>

      {isError ? (
        <div className="panel">
          <QueryError error={error} onRetry={() => void refetch()} />
        </div>
      ) : (
        <>
          <div className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold">Agenții recente</h2>
              <Link to="/superadmin/agencies" className="text-xs font-medium text-primary hover:underline">
                Vezi toate
              </Link>
            </div>
            {isLoading ? (
              <ListSkeleton rows={4} />
            ) : orgs.length === 0 ? (
              <EmptyState
                compact
                icon={Building2}
                title="Nicio agenție încă"
                description="Agențiile create prin onboarding vor apărea aici."
              />
            ) : (
              <ul className="divide-y divide-border">
                {orgs.slice(0, 8).map((o) => {
                  const users = data?.profiles.filter((p) => p.organization_id === o.id).length ?? 0;
                  return (
                    <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3 text-sm">
                      <div className="min-w-0 flex-1 basis-48">
                        <p className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium">{o.name}</span>
                          {o.is_demo ? <StatusBadge tone="warning">Demo / QA</StatusBadge> : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{o.city ?? "—"}</p>
                      </div>
                      <StatusBadge tone={organizationStatusTone[o.status] ?? "neutral"} dot>
                        {organizationStatusLabels[o.status] ?? o.status}
                      </StatusBadge>
                      <span className="text-xs text-muted-foreground">
                        Plan: <span className="font-medium text-foreground">{organizationPlanLabels[o.plan] ?? o.plan}</span>
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {users} {users === 1 ? "utilizator" : "utilizatori"}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">{formatDate(o.created_at)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold">Ultimele evenimente de audit</h2>
              <Link to="/superadmin/audit" className="text-xs font-medium text-primary hover:underline">
                Jurnal complet
              </Link>
            </div>
            {isLoading ? (
              <ListSkeleton rows={5} compact />
            ) : audit.length === 0 ? (
              <EmptyState
                compact
                icon={History}
                title="Niciun eveniment de audit"
                description="Acțiunile importante din platformă vor fi înregistrate aici."
              />
            ) : (
              <ul className="divide-y divide-border">
                {audit.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm">
                    <div className="min-w-0 flex-1 basis-48">
                      <p className="truncate font-medium">{auditActionLabel(a.action)}</p>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">{a.action}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {a.entity ? (auditEntityLabels[a.entity] ?? a.entity) : "—"}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">{formatDate(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </>
  );
}
