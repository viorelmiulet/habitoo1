/**
 * Partea unică a agentului pe Acasă, sub listele comune: primii pași (cont
 * nou), activitățile restante, lead-urile necontactate și obiectivele lunii. Datele vin dintr-o singură interogare server-side care respectă
 * RLS (agentul vede doar ce îi este asignat).
 */
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "@/components/ui/sonner";
import { AlertTriangle, CalendarClock, Check, Phone, Rocket } from "lucide-react";
import { AgentGoalsCard } from "@/components/app/dashboard/AgentGoalsCard";
import { SectionCard } from "@/components/app/SectionCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import { InlineLoading } from "@/components/app/LoadingState";
import { QueryError } from "@/components/app/QueryError";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-session";
import { formatDateTime, relativeDays } from "@/lib/format";
import { activityKindLabels } from "@/lib/labels";
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

  const { overdue } = useMemo(() => {
    const tasks = data?.tasks ?? [];
    const now = Date.now();
    return {
      overdue: tasks.filter((t) => new Date(t.startsAt).getTime() < now && !isToday(t.startsAt)),
    };
  }, [data]);

  const coldLeads = data?.coldLeads ?? [];
  const brandNew =
    data && data.totals.properties === 0 && data.totals.leads === 0 && data.totals.activities === 0;

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
          {overdue.length + coldLeads.length > 0 ? (
            <SectionCard
              dataTour="dashboard-today"
              title="De rezolvat"
              description="Activități rămase din zilele trecute și lead-uri necontactate"
              icon={CalendarClock}
              flush
            >
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
            </SectionCard>
          ) : null}

          {(data?.listingIssues.length ?? 0) > 0 ? (
            <SectionCard
              title="Anunțurile mele care au nevoie de atenție"
              icon={AlertTriangle}
              flush
              action={(data?.listingIssues.length ?? 0) > 5 ? (
                <Link to="/app/properties" className="text-sm font-medium text-gold-dark hover:underline">Vezi toate →</Link>
              ) : undefined}
            >
              <ul className="divide-y divide-border">
                {data!.listingIssues.slice(0, 5).map((row) => {
                  const main = row.issues.find((i) => i.severity === "danger") ?? row.issues[0]!;
                  return (
                    <li key={row.propertyId} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                      <Link to="/app/properties/$id" params={{ id: row.propertyId }} className="min-w-0 flex-1 truncate font-medium hover:text-primary">
                        {row.title}
                      </Link>
                      <StatusBadge tone={main.severity === "danger" ? "danger" : "warning"}>{main.label}</StatusBadge>
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
          ) : null}

          <AgentGoalsCard userId={user?.userId} />
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
