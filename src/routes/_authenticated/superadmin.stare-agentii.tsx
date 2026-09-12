import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Building2, ChevronDown, History, Search, Users } from "lucide-react";

import { PageHeader } from "@/components/app/PageHeader";
import { ListSkeleton } from "@/components/app/LoadingState";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { Input } from "@/components/ui/input";
import { appHead } from "@/components/app/app-head";
import { formatDate, formatDateTime } from "@/lib/format";
import { PLAN_LABELS, normalizePlan, planAgentLimit, seatLimitLabel } from "@/lib/plans";
import { subscriptionState, subscriptionTermLabel } from "@/lib/subscription";
import {
  getAgencyOverview,
  type AgencyHistoryEntry,
  type AgencyOverviewRow,
  type AuditValues,
} from "@/lib/superadmin-agency-overview.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/superadmin/stare-agentii")({
  head: () => appHead("Habitoo CRM — stare agenții"),
  component: AgencyOverviewPage,
});

const statusLabels: Record<string, string> = {
  active: "Activă",
  trial: "Trial",
  suspended: "Suspendată",
  pending_approval: "În așteptare",
  cancelled: "Anulată",
};

function statusTone(status: string, archived: boolean) {
  if (archived) return "neutral" as const;
  if (status === "active") return "success" as const;
  if (status === "suspended") return "danger" as const;
  if (status === "pending_approval") return "warning" as const;
  return "info" as const;
}

/** Eticheta lizibilă a unei acțiuni de audit legate de agenție. */
function actionLabel(entry: AgencyHistoryEntry): string {
  const planOf = (v: Record<string, unknown> | null) =>
    typeof v?.plan === "string" ? PLAN_LABELS[normalizePlan(v.plan)] : null;
  switch (entry.action) {
    case "organization.plan_changed": {
      const from = planOf(entry.oldValues);
      const to = planOf(entry.newValues);
      return from && to ? `Plan schimbat: ${from} → ${to}` : "Plan schimbat";
    }
    case "organization.subscription_set":
      return "Abonament setat";
    case "organization.subscription_renewed":
      return "Abonament reînnoit";
    case "organization.subscription_grace_started":
      return "Intrare în perioada de grație";
    case "organization.subscription_suspended":
      return "Suspendare la expirarea abonamentului";
    case "organization.archived":
      return "Agenție arhivată";
    case "organization.unarchived":
      return "Agenție dezarhivată";
    case "organization.approved":
      return "Agenție aprobată";
    case "organization.status_changed":
      return "Status schimbat";
    case "agency.created":
      return "Agenție creată";
    default:
      return entry.action;
  }
}

/** Detalii suplimentare din valorile jurnalizate (termen, expirare etc.). */
function actionDetails(entry: AgencyHistoryEntry): string | null {
  const v = entry.newValues;
  if (!v) return null;
  const parts: string[] = [];
  if (typeof v.term === "string") parts.push(`termen ${subscriptionTermLabel(v.term)}`);
  if (typeof v.expires_at === "string") parts.push(`expiră la ${formatDate(v.expires_at)}`);
  if (typeof v.reason === "string" && v.reason) parts.push(`motiv: ${v.reason}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function SubscriptionCell({ org }: { org: AgencyOverviewRow }) {
  if (!org.subscriptionExpiresAt) {
    return <span className="text-muted-foreground">Fără termen</span>;
  }
  const state = subscriptionState({ subscription_expires_at: org.subscriptionExpiresAt });
  return (
    <div className="space-y-0.5">
      <p className="text-sm">{subscriptionTermLabel(org.subscriptionTerm)}</p>
      <p className="text-xs text-muted-foreground">
        {org.isTrial ? "Perioadă gratuită · " : ""}
        {state.kind === "active" && `expiră ${formatDate(state.expiresAt)} (${state.daysLeft} zile)`}
        {state.kind === "grace" && `în grație, ${state.daysLeft} zile rămase`}
        {state.kind === "expired" && `expirat la ${formatDate(state.expiresAt)}`}
      </p>
    </div>
  );
}

function AgencyOverviewPage() {
  const fetchOverview = useServerFn(getAgencyOverview);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["superadmin", "agency-overview"],
    queryFn: () => fetchOverview({}),
  });

  const rows = (data?.agencies ?? []).filter((o) =>
    q.trim() ? `${o.name} ${o.city ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()) : true,
  );

  return (
    <>
      <PageHeader
        title="Stare agenții"
        description="Planul, locurile ocupate și istoricul schimbărilor fiecărei agenții, dintr-o privire."
      />

      <div className="panel flex items-center gap-4 p-4">
        <div className="relative w-full max-w-md">
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
          <ListSkeleton rows={5} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Building2} title="Nicio agenție găsită" />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((org) => {
              const limit = planAgentLimit(org.plan);
              const history = data?.historyByAgency[org.id] ?? [];
              const isOpen = expanded === org.id;
              return (
                <li key={org.id}>
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : org.id)}
                    aria-expanded={isOpen}
                    className="grid w-full grid-cols-1 items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1fr)_auto_auto]"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium">
                        <span className="truncate">{org.name}</span>
                        <StatusBadge tone={statusTone(org.status, Boolean(org.archivedAt))}>
                          {org.archivedAt ? "Arhivată" : (statusLabels[org.status] ?? org.status)}
                        </StatusBadge>
                        {org.isTrial ? <StatusBadge tone="info">Trial</StatusBadge> : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {org.city ?? "—"} · creată la {formatDate(org.createdAt)}
                      </p>
                    </div>

                    <div className="text-sm">
                      <p className="font-medium">
                        Plan {PLAN_LABELS[normalizePlan(org.plan)]}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="size-3" aria-hidden />
                        {limit === null
                          ? `${org.seatsUsed} · fără limită`
                          : `${org.seatsUsed}/${seatLimitLabel(limit)} locuri`}
                      </p>
                    </div>

                    <SubscriptionCell org={org} />

                    <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
                      <History className="size-3.5" aria-hidden />
                      {history.length} {history.length === 1 ? "schimbare" : "schimbări"}
                    </span>

                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform",
                        isOpen && "rotate-180",
                      )}
                      aria-hidden
                    />
                  </button>

                  {isOpen ? (
                    <div className="border-t border-border bg-muted/30 px-4 py-3">
                      {history.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Nicio schimbare înregistrată încă pentru această agenție.
                        </p>
                      ) : (
                        <ol className="space-y-2.5">
                          {history.map((h) => (
                            <li key={h.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm">
                              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                {formatDateTime(h.createdAt)}
                              </span>
                              <span className="font-medium">{actionLabel(h)}</span>
                              {actionDetails(h) ? (
                                <span className="text-xs text-muted-foreground">
                                  {actionDetails(h)}
                                </span>
                              ) : null}
                              <span className="text-xs text-muted-foreground">
                                de {h.actorName ?? "Sistem"}
                              </span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
