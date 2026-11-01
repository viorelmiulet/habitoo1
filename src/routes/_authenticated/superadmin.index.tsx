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
import { AgenciesCard } from "@/components/app/SuperadminAgenciesCard";
import { PortalsSection } from "@/components/app/SuperadminPortalsSection";
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

      {/* 3 · Ultimele 7 zile */}
      <WeekBlock week={data?.week} loading={isLoading} />

      <AgenciesCard rows={data?.agencies} loading={isLoading} />

      <PortalsSection portals={data?.portals} todo={data?.todo} loading={isLoading} />
    </>
  );
}
