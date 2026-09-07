/**
 * Superadmin → Dashboard global: „ce arde în platformă”.
 * Coadă de lucru, sănătatea integrărilor, creșterea platformei și activitatea
 * recentă, dintr-o singură interogare agregată server-side.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  History,
  Inbox,
  LifeBuoy,
  PlugZap,
  Users,
  Layers,
  Handshake,
  UploadCloud,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { QueryError } from "@/components/app/QueryError";
import { ListSkeleton } from "@/components/app/LoadingState";
import { PortalLogo } from "@/components/app/PortalLogo";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, formatNumber } from "@/lib/format";
import { auditActionLabel, auditEntityLabels } from "@/lib/labels";
import {
  PORTAL_CONNECTION_LABEL,
  getPortalDefinition,
  type PortalConnectionStatus,
} from "@/lib/portals/registry";
import {
  getSuperadminDashboard,
  type IntegrationHealthRow,
} from "@/lib/superadmin-dashboard.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/superadmin/")({
  component: SuperadminDashboard,
});

function SuperadminDashboard() {
  const load = useServerFn(getSuperadminDashboard);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["superadmin", "dashboard"],
    queryFn: () => load({}),
    // Cifrele nu trebuie să rămână stale la revenirea pe tab.
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 15_000,
  });

  const queue = data?.queue;
  const growth = data?.growth;

  return (
    <>
      <PageHeader
        eyebrow="Platformă"
        title="Dashboard global"
        description="Ce așteaptă intervenția ta, starea integrărilor și evoluția platformei."
      />

      {isError ? (
        <div className="panel">
          <QueryError error={error} onRetry={() => void refetch()} />
        </div>
      ) : null}

      {/* 1 · Coada de lucru */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Coada de lucru
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <QueueCard
            label="Cereri de înscriere agenție"
            count={queue?.pendingRegistrations}
            loading={isLoading}
            icon={Inbox}
            to="/superadmin/agencies"
            actionLabel="Vezi cererile în așteptare"
          />
          <QueueCard
            label="Cereri de activare portal"
            count={queue?.pendingPortalActivations}
            loading={isLoading}
            icon={PlugZap}
            to="/superadmin/portals"
            actionLabel="Deschide portalurile"
          />
          <QueueCard
            label="Tichete de suport nerezolvate"
            count={queue?.unresolvedTickets}
            loading={isLoading}
            icon={LifeBuoy}
            to="/superadmin/support"
            actionLabel="Deschide suportul"
          />
        </div>
      </section>

      {/* 2 · Sănătatea integrărilor */}
      <section className="panel overflow-hidden">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Sănătatea integrărilor</h2>
            <p className="text-xs text-muted-foreground">
              Erorile apar primele. Dacă un portal e roșu la toate agențiile, problema e la portal.
            </p>
          </div>
          <Link to="/superadmin/portals" className="text-xs font-medium text-primary hover:underline">
            Configurări
          </Link>
        </header>
        {isLoading ? (
          <ListSkeleton rows={4} />
        ) : (data?.integrations ?? []).length === 0 ? (
          <EmptyState
            compact
            icon={PlugZap}
            title="Nicio conexiune de portal configurată"
            description="Conexiunile create din Superadmin → Portaluri vor apărea aici."
          />
        ) : (
          <ul className="divide-y divide-border">
            {(data?.integrations ?? []).map((row) => (
              <IntegrationRow key={`${row.organizationId}-${row.portal}`} row={row} />
            ))}
          </ul>
        )}
      </section>

      {/* 3 · Creșterea platformei */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Creșterea platformei
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Agenții active"
            value={growth?.activeAgencies}
            hint={
              growth ? `${formatNumber(growth.pendingAgencies)} în așteptare de aprobare` : undefined
            }
            icon={Building2}
            loading={isLoading}
            to="/superadmin/agencies"
          />
          <MetricCard
            label="Utilizatori"
            value={growth?.totalUsers}
            hint={
              growth
                ? `${formatNumber(growth.admins)} admini · ${formatNumber(growth.agents)} agenți`
                : undefined
            }
            icon={Users}
            loading={isLoading}
            to="/superadmin/users"
          />
          <MetricCard
            label="Proprietăți"
            value={growth?.totalProperties}
            hint="în toate agențiile"
            icon={Layers}
            loading={isLoading}
          />
          <MetricCard
            label="Publicate pe portal"
            value={growth?.publishedProperties}
            hint="pe cel puțin un portal"
            icon={UploadCloud}
            loading={isLoading}
          />
          <MetricCard
            label="Agenții în colaborare"
            value={growth?.collaborationAgencies}
            hint="modul MLS activat"
            icon={Handshake}
            loading={isLoading}
          />
        </div>
      </section>

      {/* 4 · Activitate recentă */}
      <section className="panel overflow-hidden">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Activitate recentă</h2>
          <Link to="/superadmin/audit" className="text-xs font-medium text-primary hover:underline">
            Jurnal complet
          </Link>
        </header>
        {isLoading ? (
          <ListSkeleton rows={5} compact />
        ) : (data?.audit ?? []).length === 0 ? (
          <EmptyState
            compact
            icon={History}
            title="Niciun eveniment înregistrat"
            description="Acțiunile sensibile din platformă vor apărea aici."
          />
        ) : (
          <ul className="divide-y divide-border">
            {(data?.audit ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="truncate font-medium">{auditActionLabel(a.action)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.actorName ?? "Sistem"}
                    {a.organizationName ? ` · ${a.organizationName}` : ""}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {a.entity ? (auditEntityLabels[a.entity] ?? a.entity) : "—"}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatDateTime(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function QueueCard({
  label,
  count,
  loading,
  icon: Icon,
  to,
  actionLabel,
}: {
  label: string;
  count: number | undefined;
  loading: boolean;
  icon: LucideIcon;
  to: "/superadmin/agencies" | "/superadmin/portals" | "/superadmin/support";
  actionLabel: string;
}) {
  const active = (count ?? 0) > 0;
  return (
    <Link
      to={to}
      className={cn(
        "panel group block p-5 transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active ? "border-primary/40" : "opacity-80",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {label}
          </p>
          {loading ? (
            <Skeleton className="mt-2.5 h-8 w-14" />
          ) : (
            <p
              className={cn(
                "mt-2 text-3xl font-semibold tracking-tight tabular-nums",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              {formatNumber(count ?? 0)}
            </p>
          )}
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {loading ? "…" : active ? actionLabel : "Nimic de făcut aici"}
          </p>
        </div>
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-5" />
        </span>
      </div>
    </Link>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  loading,
  to,
}: {
  label: string;
  value: number | undefined;
  hint?: string;
  icon: LucideIcon;
  loading: boolean;
  to?: "/superadmin/agencies" | "/superadmin/users";
}) {
  const body = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        {loading ? (
          <Skeleton className="mt-2.5 h-7 w-16" />
        ) : (
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
            {formatNumber(value ?? 0)}
          </p>
        )}
        {hint ? <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-4.5" />
      </span>
    </div>
  );
  if (to) {
    return (
      <Link to={to} className="panel block p-5 transition-shadow hover:shadow-raised">
        {body}
      </Link>
    );
  }
  return <div className="panel p-5">{body}</div>;
}

function IntegrationRow({ row }: { row: IntegrationHealthRow }) {
  const definition = getPortalDefinition(row.portal);
  const key = (row.status as PortalConnectionStatus) in PORTAL_CONNECTION_LABEL
    ? (row.status as PortalConnectionStatus)
    : "not_configured";
  const meta = row.lastError
    ? { label: "Eroare", tone: "danger" as const }
    : PORTAL_CONNECTION_LABEL[key];

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 text-sm">
      <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
        <PortalLogo
          portalId={row.portal}
          name={definition?.display_name ?? row.portal}
          className="size-8"
        />
        <div className="min-w-0">
          <p className="truncate font-medium">{row.organizationName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {definition?.display_name ?? row.portal}
            {row.activated ? "" : " · neactivat"}
          </p>
        </div>
      </div>
      <StatusBadge tone={meta.tone} dot>
        {meta.label}
      </StatusBadge>
      <span className="text-xs text-muted-foreground tabular-nums">
        Ultima sincronizare: {row.lastSyncAt ? formatDateTime(row.lastSyncAt) : "—"}
      </span>
      {row.lastError ? (
        <p className="w-full truncate text-xs text-destructive" title={row.lastError}>
          {row.lastError}
        </p>
      ) : null}
      <Link
        to="/superadmin/portals"
        search={{ org: row.organizationId }}
        className="text-xs font-medium text-primary hover:underline"
      >
        Configurează
      </Link>
    </li>
  );
}
