/**
 * Dashboard ADMIN AGENȚIE — „unde pierdem”.
 *
 * Focus pe blocaje: pipeline segmentat pe agent, portofoliu incomplet,
 * portaluri cu erori, conversie lună/lună și limita de agenți a planului.
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Handshake,
  Minus,
  Plug,
  Rocket,
  TrendingUp,
  Users,
} from "lucide-react";
import { AgentPortfolioList } from "@/components/app/AgentPortfolioList";
import { SectionCard } from "@/components/app/SectionCard";
import { EmptyState } from "@/components/app/EmptyState";
import { StatusBadge } from "@/components/app/StatusBadge";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { PortalLogo } from "@/components/app/PortalLogo";
import { AgencyPortalCatalogCard } from "@/components/app/AgencyPortalCatalogCard";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { useCurrentUser } from "@/hooks/use-session";
import { relativeDays } from "@/lib/format";
import { leadStageLabels } from "@/lib/labels";
import { STALE_PROPERTY_DAYS } from "@/lib/property-readiness";
import { getManagerDashboard } from "@/lib/dashboard.functions";

function Delta({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) {
    if (current === 0) {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Minus className="size-3" /> fără date luna trecută
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success">
        <ArrowUpRight className="size-3" /> nou față de luna trecută
      </span>
    );
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="size-3" /> 0%
      </span>
    );
  }
  const up = pct > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs tabular-nums ${up ? "text-success" : "text-destructive"}`}
    >
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {up ? "+" : ""}
      {pct}%
    </span>
  );
}

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
  const stages = (data?.stageTotals ?? []).map((s) => s.stage);
  const brandNew = data && data.totals.properties === 0 && data.totals.leads === 0;
  const limitReached =
    data && data.team.limit !== null ? data.team.activeAgents >= data.team.limit : false;


  return (
    <>
      <div className="flex flex-col gap-x-6 gap-y-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 sm:flex-1">
          <h2 className="text-xl font-bold text-balance break-words">
            {data?.organizationName || user?.organization?.name || "Agenția mea"}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Unde se blochează fluxul: pipeline pe agenți, portofoliu, portaluri și conversie.
          </p>
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 [&>*]:max-w-full sm:w-auto sm:justify-end">
          <Button variant="outline" size="sm" asChild>
            <Link to="/app/reports">Rapoarte</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/app/properties/new">Adaugă proprietate</Link>
          </Button>
        </div>
      </div>

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
