import { useServerFn } from "@tanstack/react-start";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, Check, ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { RegistrationRequestDetails } from "@/components/superadmin/RegistrationRequestDetails";
import { getRegistrationRequestDetails } from "@/lib/registration-request-details.functions";
import { useRegistrationRequestActions } from "@/components/superadmin/AgencyAdminActions";
import { SummaryCard, SuperadminSection } from "@/components/superadmin/SuperadminUi";
import { PageHeader } from "@/components/app/PageHeader";
import { ListSkeleton } from "@/components/app/LoadingState";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { PLAN_LABELS, normalizePlan } from "@/lib/plans";
import { initials, orgStatusBadge } from "@/lib/superadmin-status";
import { appHead } from "@/components/app/app-head";

export const Route = createFileRoute("/_authenticated/superadmin/agencies/")({
  head: () => appHead("Habitoo CRM — agenții"),
  component: AgenciesPage,
});

type RegistrationRequestRow = {
  id: string;
  agency_name: string;
  legal_name: string;
  cui: string;
  trade_registry_number: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
};

/** Rând extensibil pentru o cerere de înscriere: detaliile se încarcă la extindere. */
function RegistrationRequestListItem({
  r,
  approving,
  rejecting,
  rejectReason,
  onApprove,
  onToggleReject,
  onRejectReason,
  onConfirmReject,
  rejectPending,
}: {
  r: RegistrationRequestRow;
  approving: boolean;
  rejecting: boolean;
  rejectReason: string;
  onApprove: () => void;
  onToggleReject: () => void;
  onRejectReason: (v: string) => void;
  onConfirmReject: () => void;
  rejectPending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const fetchDetails = useServerFn(getRegistrationRequestDetails);
  const details = useQuery({
    queryKey: ["superadmin", "registration-request", r.id],
    queryFn: () => fetchDetails({ data: { requestId: r.id } }),
    enabled: expanded,
  });

  return (
    <li className="space-y-3 rounded-[20px] border border-border/70 bg-card p-4 text-sm shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="mt-0.5 size-7 shrink-0 p-0"
            aria-label={expanded ? `Restrânge detaliile pentru ${r.agency_name}` : `Extinde detaliile pentru ${r.agency_name}`}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            <ChevronDown
              className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </Button>
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
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{formatDate(r.created_at)}</span>
          <Button size="sm" variant="ghost" className="h-11" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Ascunde detaliile" : "Vezi detalii"}
          </Button>
          <Button size="sm" className="h-11" disabled={approving} onClick={onApprove}>
            <Check className="mr-1.5 size-4" />
            Aprobă
          </Button>
          <Button size="sm" variant="outline" className="h-11" onClick={onToggleReject}>
            <X className="mr-1.5 size-4" />
            Respinge
          </Button>
        </div>
      </div>
      {rejecting ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={rejectReason}
            onChange={(e) => onRejectReason(e.target.value)}
            placeholder="Motivul respingerii (opțional, vizibil agenției)"
            className="max-w-md"
          />
          <Button size="sm" variant="destructive" disabled={rejectPending} onClick={onConfirmReject}>
            Confirmă respingerea
          </Button>
        </div>
      ) : null}
      {expanded ? (
        details.isLoading ? (
          <ListSkeleton rows={3} />
        ) : details.data ? (
          <RegistrationRequestDetails details={details.data} />
        ) : (
          <p className="text-xs text-muted-foreground">Detaliile nu au putut fi încărcate.</p>
        )
      ) : null}
    </li>
  );
}

function AgenciesPage() {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const { approveRequest, rejectRequest } = useRegistrationRequestActions();

  const { data, isLoading } = useQuery({
    queryKey: ["superadmin", "agencies"],
    queryFn: async () => {
      const [orgs, profiles] = await Promise.all([
        supabase.from("organizations").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id,organization_id"),
      ]);
      if (orgs.error) throw orgs.error;
      return { orgs: orgs.data, profiles: profiles.data ?? [] };
    },
  });

  const { data: requests, isLoading: loadingRequests } = useQuery({
    queryKey: ["superadmin", "registration-requests"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agency_registration_requests").select("*").eq("status", "pending").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const orgs = data?.orgs ?? [];
  const live = orgs.filter((o) => !o.archived_at);
  const counts = {
    pending: (requests ?? []).length,
    active: live.filter((o) => orgStatusBadge(o).tone === "success").length,
    trial: live.filter((o) => orgStatusBadge(o).label === "În probă").length,
    suspended: live.filter((o) => o.status === "suspended" || o.status === "cancelled").length,
  };
  const needle = q.trim().toLowerCase();
  const rows = orgs
    .filter((o) => (showArchived ? true : !o.archived_at))
    .filter((o) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "trial") return orgStatusBadge(o).label === "În probă";
      return o.status === statusFilter;
    })
    .filter((o) => (needle ? `${o.name} ${o.city ?? ""} ${o.cui ?? ""}`.toLowerCase().includes(needle) : true));
  const memberCount = (id: string) => data?.profiles.filter((p) => p.organization_id === id).length ?? 0;

  return (
    <div className="min-w-0 max-w-full space-y-8 overflow-x-hidden">
      <PageHeader title="Agenții" description="Cererile noi de înscriere și toate agențiile platformei. Deschide o agenție pentru plan, abonament, echipă și portaluri." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Cereri în așteptare" value={loadingRequests ? "—" : counts.pending} tone="warning" />
        <SummaryCard label="Agenții active" value={isLoading ? "—" : counts.active} tone="success" />
        <SummaryCard label="În probă" value={isLoading ? "—" : counts.trial} tone="primary" />
        <SummaryCard label="Suspendate" value={isLoading ? "—" : counts.suspended} tone="danger" />
      </div>

      <SuperadminSection title="Cereri de înscriere" description="Agenția se creează abia după aprobare.">
        {loadingRequests ? <ListSkeleton rows={3} /> : (requests ?? []).length === 0 ? (
          <div className="rounded-[20px] border border-border/70 bg-card"><EmptyState icon={Building2} title="Nicio cerere în așteptare" /></div>
        ) : (
          <ul className="space-y-3">
            {(requests ?? []).map((r) => (
              <RegistrationRequestListItem
                key={r.id}
                r={r}
                approving={approveRequest.isPending}
                rejecting={rejecting === r.id}
                rejectReason={rejectReason}
                onApprove={() => approveRequest.mutate(r.id)}
                onToggleReject={() => setRejecting((cur) => (cur === r.id ? null : r.id))}
                onRejectReason={setRejectReason}
                rejectPending={rejectRequest.isPending}
                onConfirmReject={async () => { await rejectRequest.mutateAsync({ id: r.id, reason: rejectReason }); setRejecting(null); setRejectReason(""); }}
              />
            ))}
          </ul>
        )}
      </SuperadminSection>

      <SuperadminSection title="Agenții" description="Apasă pe o agenție pentru pagina ei de detaliu.">
        <div className="mb-4 grid gap-3 rounded-[20px] border border-border/70 bg-card p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_200px_auto] md:items-center">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută agenție, oraș sau CUI…" aria-label="Caută agenție" className="h-11 pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger aria-label="Filtrează după stare" className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate stările</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="trial">În probă</SelectItem>
              <SelectItem value="pending_approval">În așteptare</SelectItem>
              <SelectItem value="suspended">Suspendate</SelectItem>
              <SelectItem value="cancelled">Anulate</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex min-h-11 items-center gap-2">
            <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
            <Label htmlFor="show-archived" className="text-sm text-muted-foreground">Arată și arhivate</Label>
          </div>
        </div>
        {isLoading ? <ListSkeleton rows={6} /> : rows.length === 0 ? (
          <div className="rounded-[20px] border border-border/70 bg-card"><EmptyState icon={Building2} title="Nicio agenție găsită" /></div>
        ) : (
          <ul className="space-y-2" data-agency-list>
            {rows.map((o) => {
              const badge = orgStatusBadge(o);
              return (
                <li key={o.id}>
                  <Link
                    to="/superadmin/agencies/$id"
                    params={{ id: o.id }}
                    className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[20px] border border-border/70 bg-card p-4 shadow-sm transition-colors hover:border-gold/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:grid-cols-[auto_minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.6fr)_auto_minmax(0,0.8fr)_auto]"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gold/15 text-sm font-semibold text-foreground" aria-hidden>{initials(o.name)}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-foreground">{o.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{o.city ?? "—"} · CUI {o.cui ?? "—"}</span>
                      <span className="mt-1 flex flex-wrap gap-1 md:hidden"><StatusBadge tone={badge.tone}>{badge.label}</StatusBadge><span className="text-xs text-muted-foreground">{PLAN_LABELS[normalizePlan(o.plan)]} · {memberCount(o.id)} agenți</span></span>
                    </span>
                    <span className="hidden text-sm md:block">{PLAN_LABELS[normalizePlan(o.plan)]}</span>
                    <span className="hidden text-sm tabular-nums text-muted-foreground md:block">{memberCount(o.id)} agenți</span>
                    <span className="hidden md:block"><StatusBadge tone={badge.tone}>{badge.label}</StatusBadge></span>
                    <span className="hidden text-xs text-muted-foreground md:block">Actualizată {formatDate(o.updated_at)}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </SuperadminSection>
    </div>
  );
}
