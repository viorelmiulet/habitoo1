import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollText, Search } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { ListSkeleton } from "@/components/app/LoadingState";
import { EmptyState } from "@/components/app/EmptyState";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/superadmin/audit")({
  component: AuditPage,
});

function AuditPage() {
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["superadmin", "audit"],
    queryFn: async () => {
      const [logs, orgs, profiles] = await Promise.all([
        supabase
          .from("audit_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(300),
        supabase.from("organizations").select("id,name"),
        supabase.from("profiles").select("id,full_name"),
      ]);
      if (logs.error) throw logs.error;
      return { logs: logs.data, orgs: orgs.data ?? [], profiles: profiles.data ?? [] };
    },
  });

  const rows = (data?.logs ?? []).filter((l) =>
    q.trim()
      ? `${l.action} ${l.entity ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())
      : true,
  );

  return (
    <>
      <PageHeader
        title="Jurnal de audit"
        description="Cine a făcut ce și când, în toate agențiile."
      />

      <div className="panel p-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Caută acțiune sau entitate…"
            className="pl-9"
          />
        </div>
      </div>

      <div className="panel overflow-hidden">
        {isLoading ? (
          <ListSkeleton rows={10} compact />
        ) : rows.length === 0 ? (
          <EmptyState icon={ScrollText} title="Niciun eveniment înregistrat" />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <StatusBadge tone="primary">{l.action}</StatusBadge>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {l.entity ?? "—"}
                  {l.entity_id ? ` · ${l.entity_id.slice(0, 8)}` : ""}
                </span>
                <span className="w-40 truncate text-xs text-muted-foreground">
                  {data?.profiles.find((p) => p.id === l.actor_id)?.full_name ?? "Sistem"}
                </span>
                <span className="w-40 truncate text-xs text-muted-foreground">
                  {data?.orgs.find((o) => o.id === l.organization_id)?.name ?? "—"}
                </span>
                <span className="w-36 text-right text-xs text-muted-foreground">
                  {formatDateTime(l.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
