/**
 * Dashboard AGENT — „ziua mea”.
 *
 * Prioritate acțiunilor: ce trebuie făcut azi, ce s-a blocat, ce anunțuri au
 * probleme. Datele vin dintr-o singură interogare server-side care respectă
 * RLS (agentul vede doar ce îi este asignat).
 */
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/components/ui/sonner";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  Handshake,
  Phone,
  Rocket,
  Sparkles,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { SectionCard } from "@/components/app/SectionCard";
import { EmptyState } from "@/components/app/EmptyState";
import { StatusBadge } from "@/components/app/StatusBadge";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-session";
import { formatDateTime, formatTime, relativeDays } from "@/lib/format";
import { activityKindLabels, leadStageLabels } from "@/lib/labels";
import {
  completeDashboardTask,
  getAgentDashboard,
  type DashboardTask,
} from "@/lib/dashboard.functions";

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

export function AgentDashboard() {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const load = useServerFn(getAgentDashboard);
  const markDone = useServerFn(completeDashboardTask);

  const dashboard = useQuery({
    queryKey: ["agent-dashboard", user?.userId],
    queryFn: () => load({}),
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 15_000,
  });

  const complete = useMutation({
    mutationFn: (activityId: string) => markDone({ data: { activityId } }),
    onSuccess: () => {
      toast.success("Activitate marcată ca finalizată.");
      void queryClient.invalidateQueries({ queryKey: ["agent-dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["activities"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = dashboard.data;

  const { today, overdue } = useMemo(() => {
    const tasks = data?.tasks ?? [];
    const now = Date.now();
    return {
      today: tasks.filter((t) => isToday(t.startsAt)),
      overdue: tasks.filter((t) => new Date(t.startsAt).getTime() < now && !isToday(t.startsAt)),
    };
  }, [data]);

  const coldLeads = data?.coldLeads ?? [];
  const nothingToDo = today.length === 0 && overdue.length === 0 && coldLeads.length === 0;
  const brandNew =
    data && data.totals.properties === 0 && data.totals.leads === 0 && data.totals.activities === 0;

  const firstName = user?.profile?.full_name?.split(" ")[0] ?? "bun venit";

  return (
    <>
      <PageHeader
        title={`Salut, ${firstName}`}
        description="Ziua ta: ce ai programat, ce s-a blocat și ce anunțuri au nevoie de atenție."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/app/calendar">Calendar</Link>
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
      ) : brandNew ? (
        <SectionCard title="Primii pași" icon={Rocket}>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Nu ai încă nimic în cont. Trei pași ca dashboardul să devină util:
            </p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                <Link className="font-medium hover:text-primary" to="/app/properties/new">
                  Adaugă prima proprietate
                </Link>{" "}
                — cu fotografii, descriere și locație pe hartă.
              </li>
              <li>
                <Link className="font-medium hover:text-primary" to="/app/contacts">
                  Înregistrează un contact
                </Link>{" "}
                și transformă-l în lead.
              </li>
              <li>
                <Link className="font-medium hover:text-primary" to="/app/activities">
                  Programează o activitate
                </Link>{" "}
                — apare aici în ziua respectivă.
              </li>
            </ol>
          </div>
        </SectionCard>
      ) : (
        <>
          {/* Secțiunea 1 — De făcut azi */}
          <SectionCard
            dataTour="dashboard-today"
            title="De făcut azi"
            description="Programări, follow-up-uri restante și lead-uri necontactate"
            icon={CalendarClock}
            flush
            action={
              <Button variant="outline" size="sm" asChild>
                <Link to="/app/activities">Toate activitățile</Link>
              </Button>
            }
          >
            {nothingToDo ? (
              <EmptyState
                icon={CheckCircle2}
                compact
                title="Ești la zi"
                description="Nu ai nimic restant și nici lead-uri neatinse. Bun moment să adaugi o proprietate nouă."
              />
            ) : (
              <ul className="divide-y divide-border">
                {overdue.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    tone="danger"
                    detail={`Restant · ${formatDateTime(task.startsAt)}`}
                    onComplete={() => complete.mutate(task.id)}
                    busy={complete.isPending}
                  />
                ))}
                {today.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    tone="info"
                    detail={`Azi · ${formatTime(task.startsAt)}`}
                    onComplete={() => complete.mutate(task.id)}
                    busy={complete.isPending}
                  />
                ))}
                {coldLeads.map((lead) => (
                  <li key={lead.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                    <StatusBadge tone="warning">
                      Necontactat · {relativeDays(lead.lastTouchAt ?? lead.createdAt)}
                    </StatusBadge>
                    <Link
                      to="/app/leads"
                      search={{ stage: lead.stage }}
                      className="min-w-0 flex-1 truncate font-medium hover:text-primary"
                    >
                      {lead.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {leadStageLabels[lead.stage]}
                      </span>
                    </Link>
                    {lead.phone ? (
                      <Button variant="outline" size="sm" asChild>
                        <a href={`tel:${lead.phone}`}>
                          <Phone className="size-4" /> Sună
                        </a>
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {/* Secțiunea 2 — Pipeline-ul meu */}
          <SectionCard
            title="Pipeline-ul meu"
            description="Lead-urile tale pe etape — click pe o etapă pentru lista filtrată"
            icon={Users}
          >
            {(data?.pipeline ?? []).every((s) => s.count === 0) ? (
              <EmptyState
                icon={Users}
                compact
                title="Niciun lead deschis"
                description="Lead-urile asignate ție apar aici, grupate pe etape."
                action={
                  <Button size="sm" asChild>
                    <Link to="/app/leads" search={{ new: true }}>
                      Adaugă lead
                    </Link>
                  </Button>
                }
              />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
                {(data?.pipeline ?? []).map((entry) => (
                  <Link
                    key={entry.stage}
                    to="/app/leads"
                    search={{ stage: entry.stage }}
                    className="rounded-xl border border-border px-3 py-3 transition-colors hover:border-primary/50 hover:bg-muted/40"
                  >
                    <p className="truncate text-xs text-muted-foreground">
                      {leadStageLabels[entry.stage]}
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">{entry.count}</p>
                  </Link>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Secțiunea 3 — Anunțuri cu probleme */}
          <SectionCard
            title="Anunțurile mele care au nevoie de atenție"
            description="Doar problemele care blochează sau slăbesc publicarea pe portaluri"
            icon={AlertTriangle}
            flush
          >
            {(data?.listingIssues.length ?? 0) === 0 ? (
              <EmptyState
                icon={Building2}
                compact
                title="Toate anunțurile tale sunt complete"
                description="Fotografii, descriere, preț și coordonate — nimic de corectat."
              />
            ) : (
              <ul className="divide-y divide-border">
                {(data?.listingIssues ?? []).map((row) => (
                  <li key={row.propertyId} className="px-5 py-3 text-sm">
                    <Link
                      to="/app/properties/$id"
                      params={{ id: row.propertyId }}
                      className="font-medium hover:text-primary"
                    >
                      {row.title}
                    </Link>
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
            )}
          </SectionCard>

          {/* Secțiunea 4 — Colaborare */}
          {data?.collaboration.enabled ? (
            <SectionCard
              title="Colaborare"
              description="Propuneri care așteaptă un răspuns"
              icon={Handshake}
              flush
              action={
                <Button variant="outline" size="sm" asChild>
                  <Link to="/app/collaboration">Deschide colaborarea</Link>
                </Button>
              }
            >
              {data.collaboration.incoming.length === 0 &&
              data.collaboration.outgoing.length === 0 ? (
                <EmptyState
                  icon={Sparkles}
                  compact
                  title="Nicio propunere în așteptare"
                  description="Aici apar propunerile primite pe proprietățile tale și cele trimise de tine."
                />
              ) : (
                <ul className="divide-y divide-border">
                  {data.collaboration.incoming.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                      <StatusBadge tone="info">Primită</StatusBadge>
                      <Link
                        to="/app/collaboration"
                        className="min-w-0 flex-1 truncate font-medium hover:text-primary"
                      >
                        {p.propertyTitle ?? "Proprietate"} · {p.clientLabel}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {p.agencyName ?? "Agenție"} · {relativeDays(p.createdAt)}
                      </span>
                    </li>
                  ))}
                  {data.collaboration.outgoing.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                      <StatusBadge tone="neutral">Trimisă</StatusBadge>
                      <Link
                        to="/app/collaboration"
                        className="min-w-0 flex-1 truncate font-medium hover:text-primary"
                      >
                        {p.propertyTitle ?? "Proprietate"} · {p.clientLabel}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {p.agencyName ?? "Agenție"} · {relativeDays(p.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          ) : null}
        </>
      )}
    </>
  );
}

function TaskRow({
  task,
  tone,
  detail,
  onComplete,
  busy,
}: {
  task: DashboardTask;
  tone: "danger" | "info";
  detail: string;
  onComplete: () => void;
  busy: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
      <StatusBadge tone={tone}>{detail}</StatusBadge>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {activityKindLabels[task.kind] ?? task.kind}: {task.title}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {[task.propertyTitle, task.contactName].filter(Boolean).join(" · ") || "Fără context"}
        </p>
      </div>
      {task.contactPhone ? (
        <Button variant="outline" size="sm" asChild>
          <a href={`tel:${task.contactPhone}`}>
            <Phone className="size-4" /> Sună
          </a>
        </Button>
      ) : null}
      {task.propertyId ? (
        <Button variant="outline" size="sm" asChild>
          <Link to="/app/properties/$id" params={{ id: task.propertyId }}>
            Deschide
          </Link>
        </Button>
      ) : null}
      <Button size="sm" variant="secondary" disabled={busy} onClick={onComplete}>
        <Check className="size-4" /> Finalizat
      </Button>
    </li>
  );
}
