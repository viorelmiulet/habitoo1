import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/superadmin/agencies")({
  component: AgenciesPage,
});

const statusLabels: Record<string, string> = {
  active: "Activă",
  trial: "Trial",
  suspended: "Suspendată",
  cancelled: "Anulată",
};

function AgenciesPage() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["superadmin", "agencies"],
    queryFn: async () => {
      const [orgs, profiles, properties] = await Promise.all([
        supabase.from("organizations").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id,organization_id"),
        supabase.from("properties").select("id,organization_id"),
      ]);
      if (orgs.error) throw orgs.error;
      return {
        orgs: orgs.data,
        profiles: profiles.data ?? [],
        properties: properties.data ?? [],
      };
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase
        .from("organizations")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superadmin"] });
      toast.success("Agenția a fost actualizată.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (data?.orgs ?? []).filter((o) =>
    q.trim() ? `${o.name} ${o.city ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()) : true,
  );

  return (
    <>
      <PageHeader
        title="Agenții"
        description="Statusul, planul și limitele fiecărei agenții din platformă."
      />

      <div className="panel p-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Caută agenție sau oraș…"
            className="pl-9"
          />
        </div>
      </div>

      <div className="panel overflow-hidden">
        {isLoading ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Se încarcă…</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={Building2} title="Nicio agenție găsită" />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate font-medium">
                    <span className="truncate">{o.name}</span>
                    {o.is_demo ? <StatusBadge tone="warning">DEMO / QA</StatusBadge> : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {o.city ?? "—"} · {o.email ?? "fără email"}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {data?.profiles.filter((p) => p.organization_id === o.id).length ?? 0}/{o.max_users}{" "}
                  utilizatori
                </span>
                <span className="text-xs text-muted-foreground">
                  {data?.properties.filter((p) => p.organization_id === o.id).length ?? 0}/
                  {o.max_properties} proprietăți
                </span>
                <Select value={o.plan} onValueChange={(v) => update.mutate({ id: o.id, patch: { plan: v } })}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="starter">starter</SelectItem>
                    <SelectItem value="growth">growth</SelectItem>
                    <SelectItem value="enterprise">enterprise</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={o.status}
                  onValueChange={(v) => update.mutate({ id: o.id, patch: { status: v } })}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <StatusBadge tone={o.status === "active" ? "success" : "warning"}>
                  {statusLabels[o.status] ?? o.status}
                </StatusBadge>
                <span className="w-24 text-right text-xs text-muted-foreground">
                  {formatDate(o.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
