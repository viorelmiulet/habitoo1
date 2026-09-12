import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Building2,
  Check,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";

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
import { approveRegistrationRequest } from "@/lib/registration-approval.functions";
import {
  PLAN_AGENT_LIMITS,
  PLAN_KEYS,
  PLAN_LABELS,
  normalizePlan,
  type PlanKey,
} from "@/lib/plans";
import {
  SUBSCRIPTION_TERMS,
  SUBSCRIPTION_TERM_LABELS,
  subscriptionState,
  subscriptionTermLabel,
  type SubscriptionTerm,
} from "@/lib/subscription";


export const Route = createFileRoute("/_authenticated/superadmin/agencies")({
  component: AgenciesPage,
});

// Etichete pentru afișare (pot exista agenții vechi cu status "trial"/"cancelled").
const statusLabels: Record<string, string> = {
  active: "Activă",
  trial: "Trial",
  suspended: "Suspendată",
  pending_approval: "În așteptare",
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

/**
 * Termenul abonamentului: 30 de zile, 12 luni sau fără termen. Data de expirare
 * se calculează în baza de date, din momentul salvării — niciodată introdusă manual.
 */
function SubscriptionPicker({
  term,
  onSave,
  saving,
}: {
  term: string | null;
  onSave: (term: SubscriptionTerm | null) => void;
  saving: boolean;
}) {
  const current = term === "30d" || term === "12m" ? term : "none";
  const [value, setValue] = useState<string>(current);
  const dirty = value !== current;
  const asTerm = value === "none" ? null : (value as SubscriptionTerm);
  return (
    <div className="flex items-center gap-2">
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Fără termen (nelimitat)</SelectItem>
          {SUBSCRIPTION_TERMS.map((t) => (
            <SelectItem key={t} value={t}>
              {SUBSCRIPTION_TERM_LABELS[t]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" disabled={!dirty || saving} onClick={() => onSave(asTerm)}>
        Salvează
      </Button>
      {asTerm && !dirty ? (
        <Button size="sm" variant="ghost" disabled={saving} onClick={() => onSave(asTerm)}>
          <RefreshCw className="mr-1.5 size-4" />
          Reînnoiește
        </Button>
      ) : null}
    </div>
  );
}



function AgenciesPage() {
  const queryClient = useQueryClient();
  const { data: me } = useCurrentUser();
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [pendingArchive, setPendingArchive] = useState<{ id: string; name: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  // Respingerea unei cereri de înscriere, cu motiv opțional.
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

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

  // Cererile de înscriere: sursa unică pentru tabul „În așteptare”.
  // Organizația nu există până la aprobare.
  const { data: requests, isLoading: loadingRequests } = useQuery({
    queryKey: ["superadmin", "registration-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agency_registration_requests")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const approveRequest = useMutation({
    mutationFn: async (id: string) => approveRegistrationRequest({ data: { requestId: id } }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["superadmin"] });
      toast.success(
        result.emailSent
          ? "Cererea a fost aprobată — agenția a fost creată, iar solicitantul a primit email de confirmare."
          : "Cererea a fost aprobată — agenția a fost creată (emailul de confirmare nu a putut fi trimis).",
      );
    },
    onError: (e: Error) => toastError(e),
  });

  const rejectRequest = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc("reject_registration_request", {
        _request_id: id,
        _reason: reason || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superadmin"] });
      toast.success("Cererea a fost respinsă.");
    },
    onError: (e: Error) => toastError(e),
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

  // Termenul abonamentului: RPC superadmin-only care calculează expirarea și scrie auditul.
  const saveSubscription = useMutation({
    mutationFn: async ({ id, term }: { id: string; term: SubscriptionTerm | null }) => {
      const { error } = await supabase.rpc("set_organization_subscription", {
        _org: id,
        _term: term,
      });
      if (error) throw error;
    },
    onSuccess: (_r, vars) => {
      queryClient.invalidateQueries({ queryKey: ["superadmin"] });
      toast.success(
        vars.term
          ? `Termenul abonamentului a fost setat la ${SUBSCRIPTION_TERM_LABELS[vars.term]}.`
          : "Agenția rămâne fără termen (acces nelimitat).",
      );
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

  // Aprobarea unei agenții aflate în așteptare: userii ei primesc acces imediat.
  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("approve_organization", { _org: id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superadmin"] });
      toast.success("Agenția a fost aprobată și are acces în aplicație.");
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

  const pendingCount = (requests ?? []).length;

  const requestRows = (requests ?? []).filter((r) =>
    q.trim()
      ? `${r.agency_name} ${r.legal_name} ${r.cui} ${r.full_name} ${r.email ?? ""}`
          .toLowerCase()
          .includes(q.trim().toLowerCase())
      : true,
  );

  const rows = (data?.orgs ?? [])
    .filter((o) => (showArchived ? true : !o.archived_at))
    .filter((o) =>
      q.trim() ? `${o.name} ${o.city ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()) : true,
    );

  return (
    <>
      <PageHeader
        title="Agenții"
        description="Cererile noi de înscriere, statusul, planul și limitele fiecărei agenții."
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
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          <Button
            size="sm"
            variant={tab === "pending" ? "default" : "ghost"}
            onClick={() => setTab("pending")}
          >
            În așteptare{pendingCount ? ` (${pendingCount})` : ""}
          </Button>
          <Button
            size="sm"
            variant={tab === "all" ? "default" : "ghost"}
            onClick={() => setTab("all")}
          >
            Toate agențiile
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
          <Label htmlFor="show-archived" className="text-sm text-muted-foreground">
            Arată și arhivate
          </Label>
        </div>
      </div>

      {tab === "pending" ? (
        <div className="panel overflow-hidden">
          {loadingRequests ? (
            <ListSkeleton rows={4} />
          ) : requestRows.length === 0 ? (
            <EmptyState icon={Building2} title="Nicio cerere în așteptare" />
          ) : (
            <ul className="divide-y divide-border">
              {requestRows.map((r) => (
                <li key={r.id} className="space-y-3 px-4 py-4 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium">
                        <span className="truncate">{r.agency_name}</span>
                        <StatusBadge tone="warning">În așteptare</StatusBadge>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.legal_name} · CUI {r.cui} · Reg. Com. {r.trade_registry_number}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.full_name} · {r.phone ?? "fără telefon"} · {r.email ?? "fără email"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(r.created_at)}
                      </span>
                      <Button
                        size="sm"
                        disabled={approveRequest.isPending}
                        onClick={() => approveRequest.mutate(r.id)}
                      >
                        <Check className="mr-1.5 size-4" />
                        Aprobă
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRejecting((cur) => (cur === r.id ? null : r.id))}
                      >
                        <X className="mr-1.5 size-4" />
                        Respinge
                      </Button>
                    </div>
                  </div>
                  {rejecting === r.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Motivul respingerii (opțional, vizibil agenției)"
                        className="max-w-md"
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={rejectRequest.isPending}
                        onClick={async () => {
                          await rejectRequest.mutateAsync({ id: r.id, reason: rejectReason });
                          setRejecting(null);
                          setRejectReason("");
                        }}
                      >
                        Confirmă respingerea
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="panel overflow-hidden">
          {isLoading ? (
            <ListSkeleton rows={6} />
          ) : rows.length === 0 ? (
            <EmptyState icon={Building2} title="Nicio agenție găsită" />
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((o) => (
                <li key={o.id} className="space-y-3 px-4 py-4 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-base font-semibold">{o.name}</span>
                        <StatusBadge tone="primary">
                          {PLAN_LABELS[normalizePlan(o.plan)]}
                        </StatusBadge>
                        <StatusBadge tone={o.status === "active" ? "success" : "warning"}>
                          {statusLabels[o.status] ?? o.status}
                        </StatusBadge>
                        {o.is_demo ? <StatusBadge tone="warning">DEMO / QA</StatusBadge> : null}
                        {o.archived_at ? <StatusBadge tone="danger">Arhivată</StatusBadge> : null}
                        {(() => {
                          const s = subscriptionState(o);
                          if (s.kind === "grace")
                            return (
                              <StatusBadge tone="warning">În grație — {s.daysLeft} zile</StatusBadge>
                            );
                          if (s.kind === "expired")
                            return <StatusBadge tone="danger">Expirată</StatusBadge>;
                          return null;
                        })()}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {o.legal_name ?? "fără nume legal"} · CUI {o.cui ?? "—"} · Reg. Com.{" "}
                        {o.trade_registry_number ?? "—"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {o.city ?? "—"} · {o.email ?? "fără email"} · înscrisă{" "}
                        {formatDate(o.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <span className="tabular-nums">
                        {data?.profiles.filter((p) => p.organization_id === o.id).length ?? 0}/
                        {o.max_users} utilizatori
                      </span>
                      <span className="tabular-nums">
                        {data?.properties.filter((p) => p.organization_id === o.id).length ?? 0}/
                        {o.max_properties} proprietăți
                      </span>
                      <span className="tabular-nums">
                        {subscriptionTermLabel(o.subscription_term)}
                        {o.subscription_expires_at
                          ? ` · expiră ${formatDate(o.subscription_expires_at)}`
                          : ""}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <PlanPicker
                      plan={o.plan}
                      onSave={(plan) => savePlan.mutate({ id: o.id, plan, previous: o.plan })}
                      saving={savePlan.isPending}
                    />
                    <SubscriptionPicker
                      key={`${o.id}-${o.subscription_term ?? "none"}-${o.subscription_expires_at ?? ""}`}
                      term={o.subscription_term}
                      onSave={(term) => saveSubscription.mutate({ id: o.id, term })}
                      saving={saveSubscription.isPending}
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
                          <SelectItem value={o.status}>
                            {statusLabels[o.status] ?? o.status}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {o.status === "pending_approval" ? (
                      <Button
                        size="sm"
                        disabled={approve.isPending}
                        onClick={() => approve.mutate(o.id)}
                      >
                        <Check className="mr-1.5 size-4" />
                        Aprobă
                      </Button>
                    ) : null}

                    {/* Acțiuni distructive, separate vizual de restul */}
                    <div className="ml-auto flex items-center gap-2 border-l border-border pl-3">
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
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={hardDelete.isPending}
                        onClick={() => setPendingDelete({ id: o.id, name: o.name })}
                      >
                        <Trash2 className="mr-1.5 size-4" />
                        Șterge
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(v) => {
          if (!v) setPendingDelete(null);
        }}
        title={`Ștergi DEFINITIV „${pendingDelete?.name ?? ""}”?`}
        description={
          <span className="text-destructive">
            Această acțiune este ireversibilă. Se șterg definitiv toate proprietățile și
            fotografiile lor, contactele, lead-urile și istoricul, cererile, activitățile,
            documentele, obiectivele, notificările, conexiunile și cheile de portal, precum și toți
            membrii agenției împreună cu conturile lor de autentificare. Nu există restaurare.
          </span>
        }
        confirmLabel="Șterge definitiv"
        destructive
        typeToConfirm={pendingDelete?.name}
        onConfirm={async () => {
          if (!pendingDelete) return;
          await hardDelete.mutateAsync({ id: pendingDelete.id, name: pendingDelete.name });
          setPendingDelete(null);
        }}
      />
    </>
  );
}
