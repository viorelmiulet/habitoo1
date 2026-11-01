/**
 * Superadmin → Dashboard global: „ce arde în platformă”.
 * Coadă de lucru, sănătatea integrărilor, creșterea platformei și activitatea
 * recentă, dintr-o singură interogare agregată server-side.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  History,
  PlugZap,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EmptyState } from "@/components/app/EmptyState";
import { QueryError } from "@/components/app/QueryError";
import { ListSkeleton } from "@/components/app/LoadingState";
import { PortalLogo } from "@/components/app/PortalLogo";
import { formatDateTime, formatNumber } from "@/lib/format";
import { auditActionLabel, auditEntityLabels } from "@/lib/labels";
import {
  PORTAL_CONNECTION_LABEL,
  getPortalDefinition,
  integrationDisplayStatus,
} from "@/lib/portals/registry";
import {
  getSuperadminDashboard,
  type IntegrationHealthRow,
} from "@/lib/superadmin-dashboard.functions";
import { cn } from "@/lib/utils";
import { appHead } from "@/components/app/app-head";
import { WeekBlock } from "@/components/app/SuperadminWeekBlock";
import { TodoBlock } from "@/components/app/SuperadminTodoBlock";
import { todoItemCount, todoSubtitle } from "@/lib/superadmin-todo";

export const Route = createFileRoute("/_authenticated/superadmin/")({
  head: () => appHead("Habitoo CRM — panou superadmin"),
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


  return (
    <>
      <PageHeader
        eyebrow="Platformă"
        title="Dashboard global"
        description={
          data?.todo
            ? todoSubtitle(new Date(), todoItemCount(data.todo))
            : "Ce așteaptă intervenția ta, starea integrărilor și evoluția platformei."
        }
      />

      {isError ? (
        <div className="panel">
          <QueryError error={error} onRetry={() => void refetch()} />
        </div>
      ) : null}

      {/* 1 · De rezolvat */}
      <TodoBlock todo={data?.todo} loading={isLoading} />

      {/* 2 · Sănătatea integrărilor */}
      <section className="panel overflow-hidden">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Sănătatea integrărilor</h2>
            <p className="text-xs text-muted-foreground">
              Erorile apar primele. Dacă un portal e roșu la toate agențiile, problema e la portal.
            </p>
          </div>
          <Link
            to="/superadmin/portals"
            className="text-xs font-medium text-primary hover:underline"
          >
            Configurări
          </Link>
        </header>
        {isLoading ? (
          <ListSkeleton rows={4} />
        ) : isError ? (
          <QueryError
            compact
            error={error}
            onRetry={() => void refetch()}
            title="Starea integrărilor nu a putut fi citită"
          />
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

      {/* 3 · Ultimele 7 zile */}
      <WeekBlock week={data?.week} loading={isLoading} />

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
        ) : isError ? (
          <QueryError
            compact
            error={error}
            onRetry={() => void refetch()}
            title="Activitatea recentă nu a putut fi citită"
          />
        ) : (data?.audit ?? []).length === 0 ? (
          <EmptyState
            compact
            icon={History}
            title="Niciun eveniment înregistrat"
            description="Acțiunile sensibile din platformă vor apărea aici."
          />
        ) : (
          <ol className="space-y-0 px-5 py-4">
            {(data?.audit ?? []).map((a) => (
              <li key={a.id} className="flex gap-3 py-2.5 text-sm">
                <span className="w-24 shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums">
                  {formatDateTime(a.createdAt)}
                </span>
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <History className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{auditActionLabel(a.action)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.actorName ?? "Sistem"}
                    {a.organizationName ? ` · ${a.organizationName}` : ""}
                    {a.entity ? ` · ${auditEntityLabels[a.entity] ?? a.entity}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

function IntegrationRow({ row }: { row: IntegrationHealthRow }) {
  const definition = getPortalDefinition(row.portal);
  const meta = PORTAL_CONNECTION_LABEL[integrationDisplayStatus(row)];

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
