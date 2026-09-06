import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Archive, ArchiveRestore, Building2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/errors";
import { PageHeader } from "@/components/app/PageHeader";
import { ListSkeleton } from "@/components/app/LoadingState";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { useCurrentUser } from "@/hooks/use-session";
import { deleteOrganizationPermanently } from "@/lib/superadmin-orgs.functions";
import {
  PLAN_AGENT_LIMITS,
  PLAN_KEYS,
  PLAN_LABELS,
  normalizePlan,
  type PlanKey,
} from "@/lib/plans";

export const Route = createFileRoute("/_authenticated/superadmin/agencies")({
  component: AgenciesPage,
});

// Etichete pentru afișare (pot exista agenții vechi cu status "trial"/"cancelled").
const statusLabels: Record<string, string> = {
  active: "Activă",
  trial: "Trial",
  suspended: "Suspendată",
  cancelled: "Anulată",
};

/** Statusurile selectabile din interfață: doar Activă și Suspendată. */
const selectableStatuses = ["active", "suspended"] as const;


/** Selector de plan cu salvare explicită. */
function PlanPicker({
  plan,
  onSave,
  saving,
}: {
  plan: string;
  onSave: (plan: PlanKey) => void;
  saving: boolean;
}) {
  const [value, setValue] = useState<PlanKey>(normalizePlan(plan));
  const dirty = value !== normalizePlan(plan);
  return (
    <div className="flex items-center gap-2">
      <Select value={value} onValueChange={(v) => setValue(v as PlanKey)}>
        <SelectTrigger className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PLAN_KEYS.map((k) => (
            <SelectItem key={k} value={k}>
              {PLAN_LABELS[k]} · {PLAN_AGENT_LIMITS[k]} agenți
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" disabled={!dirty || saving} onClick={() => onSave(value)}>
        Salvează
      </Button>
    </div>
  );
}

function AgenciesPage() {
  const queryClient = useQueryClient();
  const { data: me } = useCurrentUser();
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [pendingArchive, setPendingArchive] = useState<{ id: string; name: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

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
    onError: (e: Error) => toastError(e),
  });

  const savePlan = useMutation({
    mutationFn: async ({ id, plan, previous }: { id: string; plan: PlanKey; previous: string }) => {
      const { error } = await supabase.from("organizations").update({ plan }).eq("id", id);
      if (error) throw error;
      // Jurnalizarea schimbării de plan în audit log.
      await supabase.from("audit_logs").insert({
        organization_id: id,
        action: "organization.plan_changed",
        entity: "organizations",
        entity_id: id,
        old_values: { plan: previous },
        new_values: { plan, agent_limit: PLAN_AGENT_LIMITS[plan] },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superadmin"] });
      toast.success("Planul agenției a fost salvat.");
    },
    onError: (e: Error) => toastError(e),
  });

  // Arhivarea nu șterge date: marchează doar agenția și blochează accesul membrilor.
  const setArchived = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase
        .from("organizations")
        .update({
          archived_at: archived ? new Date().toISOString() : null,
          archived_by: archived ? (me?.userId ?? null) : null,
        })
        .eq("id", id);
      if (error) throw error;
      await supabase.from("audit_logs").insert({
        organization_id: id,
        actor_id: me?.userId ?? null,
        action: archived ? "organization.archived" : "organization.unarchived",
        entity: "organizations",
        entity_id: id,
        new_values: { archived },
      });
    },
    onSuccess: (_r, vars) => {
      queryClient.invalidateQueries({ queryKey: ["superadmin"] });
      toast.success(vars.archived ? "Agenția a fost arhivată." : "Agenția a fost reactivată.");
    },
    onError: (e: Error) => toastError(e),
  });

  // Ștergere definitivă: elimină agenția și toate datele ei, ireversibil.
  const hardDelete = useMutation({
    mutationFn: async (vars: { id: string; name: string }) =>
      deleteOrganizationPermanently({ data: { organizationId: vars.id, confirmName: vars.name } }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["superadmin"] });
      const total = Object.values(res.deletedRows).reduce((a, b) => a + Number(b ?? 0), 0);
      toast.success(
        `Agenția „${res.organizationName}” a fost ștearsă definitiv (${total} înregistrări, ${res.deletedAuthUsers} conturi).`,
      );
      if (res.authErrors.length)
        toast.warning(`Unele conturi nu au putut fi șterse: ${res.authErrors.join("; ")}`);
    },
    onError: (e: Error) => toastError(e),
  });

  const rows = (data?.orgs ?? [])
    .filter((o) => (showArchived ? true : !o.archived_at))
    .filter((o) =>
      q.trim() ? `${o.name} ${o.city ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()) : true,
    );

  return (
    <>
      <PageHeader
        title="Agenții"
        description="Statusul, planul și limitele fiecărei agenții din platformă."
      />

      <div className="panel flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Caută agenție sau oraș…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
          <Label htmlFor="show-archived" className="text-sm text-muted-foreground">
            Arată și arhivate
          </Label>
        </div>
      </div>

      <div className="panel overflow-hidden">
        {isLoading ? (
          <ListSkeleton rows={6} />
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
                    {o.archived_at ? <StatusBadge tone="danger">Arhivată</StatusBadge> : null}
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
                <PlanPicker
                  plan={o.plan}
                  onSave={(plan) => savePlan.mutate({ id: o.id, plan, previous: o.plan })}
                  saving={savePlan.isPending}
                />
                <Select
                  value={o.status}
                  onValueChange={(v) => update.mutate({ id: o.id, patch: { status: v } })}
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableStatuses.map((k) => (
                      <SelectItem key={k} value={k}>
                        {statusLabels[k]}
                      </SelectItem>
                    ))}
                    {selectableStatuses.includes(o.status as "active" | "suspended") ? null : (
                      <SelectItem value={o.status}>{statusLabels[o.status] ?? o.status}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <StatusBadge tone={o.status === "active" ? "success" : "warning"}>
                  {statusLabels[o.status] ?? o.status}
                </StatusBadge>
                {o.archived_at ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={setArchived.isPending}
                    onClick={() => setArchived.mutate({ id: o.id, archived: false })}
                  >
                    <ArchiveRestore className="mr-1.5 size-4" />
                    Reactivează
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={setArchived.isPending}
                    onClick={() => setPendingArchive({ id: o.id, name: o.name })}
                  >
                    <Archive className="mr-1.5 size-4" />
                    Arhivează
                  </Button>
                )}
                <span className="w-24 text-right text-xs text-muted-foreground">
                  {formatDate(o.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={pendingArchive !== null}
        onOpenChange={(v) => {
          if (!v) setPendingArchive(null);
        }}
        title={`Arhivezi „${pendingArchive?.name ?? ""}”?`}
        description="Datele agenției (proprietăți, utilizatori, lead-uri) NU se șterg. Agenția dispare din listele normale și membrii ei nu mai pot accesa aplicația până la reactivare."
        confirmLabel="Arhivează agenția"
        destructive
        onConfirm={async () => {
          if (!pendingArchive) return;
          await setArchived.mutateAsync({ id: pendingArchive.id, archived: true });
          setPendingArchive(null);
        }}
      />
    </>

  );
}
