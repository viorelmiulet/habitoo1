import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Search, Users } from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/errors";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import { roleLabels } from "@/lib/labels";

export const Route = createFileRoute("/_authenticated/superadmin/users")({
  component: UsersPage,
});

function UsersPage() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["superadmin", "users"],
    queryFn: async () => {
      const [profiles, roles, orgs] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id,role"),
        supabase.from("organizations").select("id,name"),
      ]);
      if (profiles.error) throw profiles.error;
      return { profiles: profiles.data, roles: roles.data ?? [], orgs: orgs.data ?? [] };
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("profiles").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superadmin", "users"] });
      toast.success("Statusul utilizatorului a fost actualizat.");
    },
    onError: (e: Error) => toastError(e),
  });

  const rows = (data?.profiles ?? []).filter((p) =>
    q.trim()
      ? `${p.full_name} ${p.email ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())
      : true,
  );

  const orgName = (id: string | null) =>
    id ? (data?.orgs.find((o) => o.id === id)?.name ?? "—") : "Fără agenție";

  return (
    <>
      <PageHeader title="Utilizatori" description="Toți utilizatorii platformei, cu rolurile și agenția lor." />

      <div className="panel p-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Caută nume sau email…"
            className="pl-9"
          />
        </div>
      </div>

      <div className="panel overflow-hidden">
        {isLoading ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Se încarcă…</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={Users} title="Niciun utilizator găsit" />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((p) => {
              const userRoles = (data?.roles ?? []).filter((r) => r.user_id === p.id);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.email ?? "—"}</p>
                  </div>
                  <span className="w-40 truncate text-xs text-muted-foreground">
                    {orgName(p.organization_id)}
                  </span>
                  {userRoles.map((r) => (
                    <StatusBadge key={r.role} tone="primary">
                      {roleLabels[r.role] ?? r.role}
                    </StatusBadge>
                  ))}
                  <StatusBadge tone={p.is_active ? "success" : "neutral"}>
                    {p.is_active ? "Activ" : "Suspendat"}
                  </StatusBadge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleActive.mutate({ id: p.id, is_active: !p.is_active })}
                  >
                    {p.is_active ? "Suspendă" : "Reactivează"}
                  </Button>
                  <span className="w-24 text-right text-xs text-muted-foreground">
                    {formatDate(p.created_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
