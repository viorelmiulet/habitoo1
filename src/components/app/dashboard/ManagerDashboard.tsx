/**
 * Dashboard ADMIN AGENȚIE — „unde pierdem”.
 *
 * Pe Acasă rămâne doar „Primii pași” pentru agenții noi. Analizele sunt în
 * Rapoarte → „Echipă și portofoliu” (TeamPortfolioReport).
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Rocket } from "lucide-react";
import { SectionCard } from "@/components/app/SectionCard";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { useCurrentUser } from "@/hooks/use-session";
import { getManagerDashboard } from "@/lib/dashboard.functions";

export function ManagerDashboard() {
  const { data: user } = useCurrentUser();
  const load = useServerFn(getManagerDashboard);

  const dashboard = useQuery({
    queryKey: ["manager-dashboard", user?.organization?.id],
    queryFn: () => load({}),
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 15_000,
  });

  const data = dashboard.data;
  const brandNew = data && data.totals.properties === 0 && data.totals.leads === 0;


  return (
    <>
      {dashboard.isLoading ? (
        <div className="panel p-6">
          <InlineLoading label="Se încarcă dashboardul…" />
        </div>
      ) : dashboard.isError ? (
        <div className="panel p-6">
          <QueryError error={dashboard.error} onRetry={() => dashboard.refetch()} />
        </div>
      ) : (
        <>
          {brandNew ? (
            <SectionCard title="Primii pași pentru agenția ta" icon={Rocket}>
              <ol className="list-decimal space-y-2 pl-5 text-sm">
                <li>
                  <Link className="font-medium hover:text-primary" to="/app/team">
                    Invită agenții
                  </Link>{" "}
                  — fiecare primește doar portofoliul lui.
                </li>
                <li>
                  <Link className="font-medium hover:text-primary" to="/app/properties/new">
                    Adaugă primele proprietăți
                  </Link>{" "}
                  cu fotografii, descriere și locație pe hartă.
                </li>
                <li>
                  <Link className="font-medium hover:text-primary" to="/app/settings">
                    Cere activarea portalurilor
                  </Link>{" "}
                  pe care vrei să publici.
                </li>
              </ol>
            </SectionCard>
          ) : null}
        </>
      )}
    </>
  );
}
