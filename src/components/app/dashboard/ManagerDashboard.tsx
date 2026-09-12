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
import { PageHeader } from "@/components/app/PageHeader";
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
      <PageHeader
        title={data?.organizationName || user?.organization?.name || "Agenția mea"}
        description="Unde se blochează fluxul: pipeline pe agenți, portofoliu, portaluri și conversie."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/app/reports">Rapoarte</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/app/properties/new">Adaugă proprietate</Link>
            </Button>
          </>
        }
      />

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

          {/* Secțiunea 1 — Pipeline pe agenți */}
          <SectionCard
            title="Pipeline pe agenți"
            description="Cine are lead-uri blocate (fără atingere de peste 7 zile)"
            icon={Users}
            flush
            action={
              <Button variant="outline" size="sm" asChild>
                <Link to="/app/leads">Deschide pipeline-ul</Link>
              </Button>
            }
          >
            {(data?.agents.length ?? 0) === 0 ? (
              <EmptyState
                icon={Users}
                compact
                title="Nu există încă agenți"
                description="Invită primii agenți ca să vezi pipeline-ul segmentat."
                action={
                  <Button size="sm" asChild>
                    <Link to="/app/team">Invită agenți</Link>
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      {stages.map((stage) => (
                        <TableHead key={stage} className="text-right">
                          {leadStageLabels[stage]}
                        </TableHead>
                      ))}
                      <TableHead className="text-right">Blocate</TableHead>
                      <TableHead className="text-right">Anunțuri</TableHead>
                      <TableHead>Ultima atingere</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.agents ?? []).map((agent) => (
                      <TableRow key={agent.agentId}>
                        <TableCell className="font-medium">
                          {agent.agentName}
                          {agent.isActive ? null : (
                            <span className="ml-2 text-xs text-muted-foreground">(inactiv)</span>
                          )}
                        </TableCell>
                        {stages.map((stage) => (
                          <TableCell key={stage} className="text-right tabular-nums">
                            {agent.stages[stage] ?? 0}
                          </TableCell>
                        ))}
                        <TableCell className="text-right">
                          {agent.stalledLeads > 0 ? (
                            <StatusBadge tone="danger">{agent.stalledLeads}</StatusBadge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {agent.properties}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {agent.lastTouchAt ? relativeDays(agent.lastTouchAt) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>

          {/* Secțiunea 2 — Sănătatea portofoliului */}
          <SectionCard
            title="Sănătatea portofoliului"
            description={`Anunțuri care nu trec validarea portalurilor și oferte fără activitate de peste ${STALE_PROPERTY_DAYS} de zile`}
            icon={Building2}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-border p-4">
                <p className="text-xs text-muted-foreground uppercase">Anunțuri incomplete</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {data?.portfolio.incompleteCount ?? 0}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  din {data?.portfolio.totalLive ?? 0} anunțuri active
                </p>
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="text-xs text-muted-foreground uppercase">Fără activitate 30+ zile</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {data?.portfolio.staleCount ?? 0}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  necesită re-contactarea proprietarului
                </p>
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="text-xs text-muted-foreground uppercase">Neasignate</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {data?.portfolio.unassigned ?? 0}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  anunțuri fără agent responsabil
                </p>
              </div>
            </div>

            {(data?.portfolio.incomplete.length ?? 0) > 0 ? (
              <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
                {(data?.portfolio.incomplete ?? []).map((row) => (
                  <li key={row.propertyId} className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to="/app/properties/$id"
                        params={{ id: row.propertyId }}
                        className="font-medium hover:text-primary"
                      >
                        {row.title}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {row.agentName ?? "neasignat"}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {row.issues.map((issue) => (
                        <StatusBadge
                          key={issue.code + issue.label}
                          tone={issue.severity === "danger" ? "danger" : "warning"}
                        >
                          {issue.label}
                        </StatusBadge>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            {(data?.portfolio.stale.length ?? 0) > 0 ? (
              <div className="mt-4 rounded-xl border border-border">
                <p className="border-b border-border px-4 py-2 text-xs font-medium uppercase text-muted-foreground">
                  Fără activitate recentă
                </p>
                <ul className="divide-y divide-border">
                  {(data?.portfolio.stale ?? []).map((row) => (
                    <li
                      key={row.propertyId}
                      className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm"
                    >
                      <Link
                        to="/app/properties/$id"
                        params={{ id: row.propertyId }}
                        className="min-w-0 flex-1 truncate font-medium hover:text-primary"
                      >
                        {row.title}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {row.agentName ?? "neasignat"} · {relativeDays(row.lastActivityAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {(data?.portfolio.totalLive ?? 0) === 0 ? (
              <EmptyState
                icon={Building2}
                compact
                title="Portofoliu gol"
                description="Adaugă primele proprietăți ca să putem verifica dacă trec validarea portalurilor."
                action={
                  <Button size="sm" asChild>
                    <Link to="/app/properties/new">Adaugă proprietate</Link>
                  </Button>
                }
              />
            ) : null}
          </SectionCard>

          {/* Secțiunea 3 — Portaluri */}
          <SectionCard
            title="Portaluri"
            description="Anunțuri active și erori per portal"
            icon={Plug}
          >
            {(data?.portals.length ?? 0) === 0 ? (
              <EmptyState
                icon={Plug}
                compact
                title="Nu publici încă pe niciun portal"
                description="Cere activarea unui portal mai jos, apoi bifează portalul pe fiecare anunț."
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {(data?.portals ?? []).map((portal) => (
                  <div
                    key={portal.portalKey}
                    className="flex items-center gap-3 rounded-xl border border-border p-4"
                  >
                    <PortalLogo portalId={portal.portalKey} name={portal.displayName} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{portal.displayName}</p>
                      <p className="text-xs text-muted-foreground">
                        {portal.active} anunțuri active
                      </p>
                    </div>
                    {portal.errors > 0 ? (
                      <StatusBadge tone="danger">{portal.errors} erori</StatusBadge>
                    ) : (
                      <StatusBadge tone="success">OK</StatusBadge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <AgencyPortalCatalogCard />

          {/* Secțiunea 4 — Conversie */}
          <SectionCard
            title="Conversie ultimele 30 de zile"
            description="Comparație cu cele 30 de zile anterioare"
            icon={TrendingUp}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              {(data?.conversion ?? []).map((row) => (
                <div key={row.label} className="rounded-xl border border-border p-4">
                  <p className="text-xs text-muted-foreground uppercase">{row.label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{row.current}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Delta current={row.current} previous={row.previous} />
                    <span className="text-xs text-muted-foreground">(anterior {row.previous})</span>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Secțiunea 5 — Echipă */}
          <SectionCard
            title="Echipă"
            description={`Plan ${data?.team.planKeyLabel ?? ""}`}
            icon={Handshake}
            action={
              <Button variant="outline" size="sm" asChild>
                <Link to="/app/team">Pagina Agenți</Link>
              </Button>
            }
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {data?.team.activeAgents ?? 0} / {data?.team.limit ?? 0} agenți activi
                </span>
                {limitReached ? (
                  <StatusBadge tone="danger">Limita planului atinsă</StatusBadge>
                ) : (
                  <StatusBadge tone="success">Locuri disponibile</StatusBadge>
                )}
              </div>
              <Progress
                value={
                  data && data.team.limit > 0
                    ? Math.min(100, (data.team.activeAgents / data.team.limit) * 100)
                    : 0
                }
              />
              {limitReached ? (
                <p className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertTriangle className="size-3.5" /> Pentru a adăuga agenți noi ai nevoie de un
                  plan superior.
                </p>
              ) : null}
            </div>
          </SectionCard>
        </>
      )}
    </>
  );
}
