import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Users, Layers, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { KpiCard } from "@/components/app/KpiCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/superadmin/")({
  component: SuperadminDashboard;
});

function SuperadminDashboard() {
  const { data } = useQuery({
    queryKey: ["superadmin", "overview"],
    queryFn: async () => {
      const [orgs, profiles, properties, leads, audit] = await Promise.all([
        supabase.from("organizations").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id,organization_id,is_active"),
        supabase.from("properties").select("id,organization_id"),
        supabase.from("leads").select("id,organization_id"),
        supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(10),
      ]);
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

  return (
    <>
      <PageHeader
        title="Administrare platformă"
        description="Toate agențiile, utilizatorii și activitatea din platformă."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Agenții" value={orgs.length} icon={Building2} />
        <KpiCard label="Utilizatori" value={data?.profiles.length ?? 0} icon={Users} tone="accent" />
        <KpiCard label="Proprietăți" value={data?.properties.length ?? 0} icon={Layers} tone="info" />
        <KpiCard label="Lead-uri" value={data?.leads.length ?? 0} icon={ShieldCheck} tone="success" />
      </div>

      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Agenții recente</h2>
          <Link to="/superadmin/agencies" className="text-xs text-primary hover:underline">
            Vezi toate
          </Link>
        </div>
        <ul className="divide-y divide-border">
          {orgs.slice(0, 8).map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{o.name}</p>
                <p className="truncate text-xs text-muted-foreground">{o.city ?? "—"}</p>
              </div>
              <StatusBadge tone={o.status === "active" ? "success" : "warning"}>{o.status}</StatusBadge>
              <StatusBadge tone="primary">{o.plan}</StatusBadge>
              <span className="text-xs text-muted-foreground">
                {data?.profiles.filter((p) => p.organization_id === o.id).length ?? 0} utilizatori
              </span>
              <span className="text-xs text-muted-foreground">{formatDate(o.created_at)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Ultimele evenimente de audit</h2>
          <Link to="/superadmin/audit" className="text-xs text-primary hover:underline">
            Jurnal complet
          </Link>
        </div>
        <ul className="divide-y divide-border">
          {(data?.audit ?? []).map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{a.action}</span>
              <span className="text-xs text-muted-foreground">{a.entity ?? "—"}</span>
              <span className="text-xs text-muted-foreground">{formatDate(a.created_at)}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
