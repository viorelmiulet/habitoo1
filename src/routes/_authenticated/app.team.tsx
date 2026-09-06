import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Users, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/errors";
import { PageHeader } from "@/components/app/PageHeader";
import { ListSkeleton } from "@/components/app/LoadingState";
import { EmptyState } from "@/components/app/EmptyState";
import { StatusBadge } from "@/components/app/StatusBadge";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCurrentUser } from "@/hooks/use-session";
import { formatDate } from "@/lib/format";
import { roleLabels } from "@/lib/labels";
import {
  getTeamOverview,
  inviteAgent,
  removeAgent,
  setAgentActive,
  type TeamOverview,
} from "@/lib/agency-team.functions";

export const Route = createFileRoute("/_authenticated/app/team")({
  component: TeamPage,
});

function TeamPage() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const fetchOverview = useServerFn(getTeamOverview);
  const invite = useServerFn(inviteAgent);
  const toggle = useServerFn(setAgentActive);
  const remove = useServerFn(removeAgent);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", full_name: "" });
  const [pendingRemoval, setPendingRemoval] = useState<{ id: string; name: string } | null>(null);

  const isAdmin = user?.isAdmin ?? false;

  const { data, isLoading, error } = useQuery({
    queryKey: ["agency", "team"],
    queryFn: () => fetchOverview(),
    enabled: isAdmin,
  });

  const applyOverview = (overview: TeamOverview) => {
    queryClient.setQueryData(["agency", "team"], overview);
  };

  const inviteMutation = useMutation({
    mutationFn: () => invite({ data: { email: form.email, full_name: form.full_name } }),
    onSuccess: (overview) => {
      applyOverview(overview);
      setOpen(false);
      setForm({ email: "", full_name: "" });
      toast.success("Invitația a fost trimisă prin email.");
    },
    onError: (e: Error) => toastError(e),
  });

  const toggleMutation = useMutation({
    mutationFn: (vars: { userId: string; isActive: boolean }) => toggle({ data: vars }),
    onSuccess: (overview) => {
      applyOverview(overview);
      toast.success("Statusul agentului a fost actualizat.");
    },
    onError: (e: Error) => toastError(e),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => remove({ data: { userId } }),
    onSuccess: (overview) => {
      applyOverview(overview);
      setPendingRemoval(null);
      toast.success("Agentul a fost eliminat din agenție.");
    },
    onError: (e: Error) => toastError(e),
  });

  if (!isAdmin) {
    return (
      <>
        <PageHeader title="Agenți" description="Echipa agenției tale." />
        <div className="panel p-6 text-sm text-muted-foreground">
          Doar administratorul agenției poate gestiona agenții.
        </div>
      </>
    );
  }

  const limitReached = data ? !data.canInvite : false;

  return (
    <>
      <PageHeader
        title="Agenți"
        description="Adaugă agenții agenției tale și gestionează locurile disponibile în planul curent."
        actions={
          <Button onClick={() => setOpen(true)} disabled={!data || limitReached}>
            <UserPlus className="size-4" />
            Adaugă agent
          </Button>
        }
      />

      <div className="panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="text-sm font-medium">
            {data ? `${data.seatsUsed} din ${data.seatLimit} agenți folosiți` : "Se încarcă locurile…"}
          </p>
          <p className="text-xs text-muted-foreground">
            {data ? `Plan ${data.planLabel}` : "—"}
          </p>
        </div>
        {data ? (
          <StatusBadge tone={limitReached ? "warning" : "success"}>
            {limitReached ? "Limită atinsă" : `${data.seatLimit - data.seatsUsed} locuri libere`}
          </StatusBadge>
        ) : null}
      </div>

      {limitReached && data?.upgradeHint ? (
        <div className="panel border-warning/40 bg-warning/10 p-4 text-sm">{data.upgradeHint}</div>
      ) : null}

      <div className="panel overflow-hidden">
        {isLoading ? (
          <ListSkeleton rows={5} />
        ) : error ? (
          <div className="p-6 text-sm text-destructive">{(error as Error).message}</div>
        ) : (data?.members.length ?? 0) === 0 ? (
          <EmptyState icon={Users} title="Niciun membru în agenție" />
        ) : (
          <ul className="divide-y divide-border">
            {data?.members.map((m) => {
              const isAgent = m.roles.includes("agent");
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.email ?? "—"}</p>
                  </div>
                  {m.roles.map((r) => (
                    <StatusBadge key={r} tone="primary">
                      {roleLabels[r] ?? r}
                    </StatusBadge>
                  ))}
                  {m.invited ? <StatusBadge tone="warning">Invitație trimisă</StatusBadge> : null}
                  <StatusBadge tone={m.is_active ? "success" : "neutral"}>
                    {m.is_active ? "Activ" : "Inactiv"}
                  </StatusBadge>
                  <span className="w-24 text-right text-xs text-muted-foreground">
                    {formatDate(m.created_at)}
                  </span>
                  {isAgent && m.id !== user?.userId ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={toggleMutation.isPending}
                        onClick={() =>
                          toggleMutation.mutate({ userId: m.id, isActive: !m.is_active })
                        }
                      >
                        {m.is_active ? "Dezactivează" : "Reactivează"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setPendingRemoval({ id: m.id, name: m.full_name })}
                      >
                        Elimină
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adaugă agent</DialogTitle>
            <DialogDescription>
              Agentul primește un email de invitație pentru a-și seta parola și intră direct în agenția
              ta.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              inviteMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="agent_name">Nume complet</Label>
              <Input
                id="agent_name"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent_email">Email</Label>
              <Input
                id="agent_email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Anulează
              </Button>
              <Button type="submit" disabled={inviteMutation.isPending}>
                Trimite invitația
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(v) => (v ? null : setPendingRemoval(null))}
        title="Elimini agentul din agenție?"
        description={`Contul lui ${pendingRemoval?.name ?? ""} va fi șters și locul se eliberează în planul tău.`}
        confirmLabel="Elimină agentul"
        destructive
        onConfirm={() => {
          if (pendingRemoval) removeMutation.mutate(pendingRemoval.id);
        }}
      />
    </>
  );
}
