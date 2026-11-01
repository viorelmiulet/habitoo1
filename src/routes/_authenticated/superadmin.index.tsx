/**
 * Superadmin → Dashboard global: De rezolvat → Ultimele 7 zile → Agenții →
 * Portaluri, dintr-o singură interogare agregată server-side.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/app/PageHeader";
import { QueryError } from "@/components/app/QueryError";
import { getSuperadminDashboard } from "@/lib/superadmin-dashboard.functions";
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

      {/* 2 · Ultimele 7 zile */}
      <WeekBlock week={data?.week} loading={isLoading} />

      <AgenciesCard rows={data?.agencies} loading={isLoading} />

      <PortalsSection portals={data?.portals} todo={data?.todo} loading={isLoading} />
    </>
  );
}
