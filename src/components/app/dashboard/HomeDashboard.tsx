/**
 * Pagina Acasă (admin și agent): salut, agenda, cifre, etape și ultimele
 * proprietăți/lead-uri. Datele vin din `useHomeDashboard` (RLS decide ce vede fiecare).
 */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Building2,
  CalendarDays,
  ClipboardList,
  Lightbulb,
  Plus,
  UserRound,
  Users,
} from "lucide-react";
import { PropertyThumb, usePropertyCovers } from "@/components/app/PropertyThumb";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HOME_STAGES, useHomeDashboard, type HomeMetric } from "@/hooks/use-home-dashboard";
import { formatMoney, formatTime, relativeDays } from "@/lib/format";
import { leadStageLabels, propertyStatusLabels, propertyStatusTone, propertyTypeLabels, requestKindLabels } from "@/lib/labels";
import { requestStatusLabels, requestStatusTone } from "@/lib/crm";
import { cn } from "@/lib/utils";
import { tipOfTheDay } from "./daily-tips";
import { DailyNoteCard } from "./DailyNoteCard";
import { HabitooNewsCard } from "./HabitooNewsCard";
import { greetingFor } from "./greeting";
import { dailyAdditions, leadSourceLabel, monthComparison, relativeTime, trendLabel } from "./home-stats";

const CARD = "rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6";

const STAGE_STYLE: Record<(typeof HOME_STAGES)[number], string> = {
  new: "bg-info/10 text-info border-info/20",
  contacted: "bg-gold-tint text-gold-dark border-gold/30",
  viewing: "bg-warning/10 text-warning-text border-warning/25",
  offer: "bg-success/10 text-success border-success/20",
  negotiation: "bg-primary/5 text-primary border-primary/15",
};
const LEAD_STAGE_STYLE: Record<string, string> = {
  ...STAGE_STYLE,
  won: "bg-success/10 text-success border-success/20",
  lost: "bg-muted text-muted-foreground border-border",
};

function CardTitle({ icon: Icon, title, action }: { icon: typeof Users; title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
      <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gold-tint text-gold-dark">
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="truncate">{title}</span>
      </h2>
      {action}
    </div>
  );
}

function SeeAll({ to }: { to: "/app/properties" | "/app/requests" | "/app/activities" | "/app/leads" }) {
  return (
    <Link to={to} className="shrink-0 text-sm font-medium text-gold-dark hover:underline">
      Vezi toate →
    </Link>
  );
}

function EmptyNote({ icon: Icon, title, text }: { icon: typeof Users; title: string; text?: string }) {
  return (
    <div className="flex flex-col items-center py-4 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="mt-3 text-sm font-medium">{title}</p>
      {text ? <p className="mt-1 max-w-xs text-sm text-muted-foreground">{text}</p> : null}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const w = 120;
  const h = 32;
  const step = w / (values.length - 1 || 1);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full text-gold" preserveAspectRatio="none" aria-hidden>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function MetricCard({
  label,
  metric,
  icon: Icon,
  to,
  now,
  search,
}: {
  label: string;
  metric: HomeMetric;
  icon: typeof Users;
  to: "/app/properties" | "/app/requests" | "/app/leads" | "/app/contacts";
  now: Date;
  search?: { deschise: true };
}) {
  const series = dailyAdditions(metric.createdAt, now);
  const cmp = monthComparison(metric.createdAt, now);
  const trend = trendLabel(cmp.current, cmp.previous);
  return (
    <Link to={to} search={search as never} className={cn(CARD, "block min-w-0 transition-shadow hover:border-gold/50 hover:shadow-md")}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm text-muted-foreground">{label}</p>
        <Icon className="size-4 shrink-0 text-gold-dark" aria-hidden />
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums">{metric.total}</span>
        <span className="text-sm font-medium text-success">+{series[series.length - 1]} azi</span>
      </div>
      <p
        className={cn(
          "mt-1 text-xs font-medium",
          trend.tone === "up" ? "text-success" : trend.tone === "down" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {trend.text}
      </p>
      <div className="mt-3">
        <Sparkline values={series} />
      </div>
    </Link>
  );
}

function budgetLabel(min: number | null, max: number | null, currency: string) {
  if (min && max) return `${formatMoney(min, currency)} – ${formatMoney(max, currency)}`;
  if (max) return `până la ${formatMoney(max, currency)}`;
  if (min) return `de la ${formatMoney(min, currency)}`;
  return "Buget nespecificat";
}

export function HomeDashboard({ organizationId, firstName }: { organizationId?: string | null; firstName: string }) {
  const { data, isLoading } = useHomeDashboard(organizationId);
  const coverFor = usePropertyCovers((data?.latestProperties ?? []).map((p) => p.id));
  const now = new Date();

  return (
    <div className="min-w-0 space-y-6" data-tour="dashboard-overview">
      {/* 1. Banner de salut */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy to-navy-muted/90 p-6 text-on-navy shadow-sm sm:p-8">
        <div aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-gold" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-center">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-balance sm:text-3xl">
              {greetingFor(now)}, {firstName}!
            </h1>
            <p className="mt-1 text-navy-foreground">Iată ce se întâmplă azi în agenția ta.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild className="bg-gold text-gold-foreground hover:bg-gold/90">
                <Link to="/app/properties/new">
                  <Plus className="size-4" /> Adaugă proprietate
                </Link>
              </Button>
              <Button asChild variant="outline" className="border-on-navy/30 bg-transparent text-on-navy hover:bg-on-navy/10 hover:text-on-navy">
                <Link to="/app/requests" search={{ new: true }}>
                  <Plus className="size-4" /> Adaugă cerere
                </Link>
              </Button>
            </div>
          </div>
          <div className="min-w-0 rounded-xl border border-gold/30 bg-on-navy/5 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-gold uppercase">
              <Lightbulb className="size-4" aria-hidden /> Mesajul zilei
            </p>
            <p className="mt-2 text-sm leading-relaxed">{tipOfTheDay(now)}</p>
          </div>
        </div>
      </section>

      {isLoading || !data ? (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
        </div>
      ) : (
        <>
          {/* 2. Agenda, noutăți, notița zilei */}
          <div className="grid gap-4 lg:grid-cols-3">
            <section className={cn(CARD, "min-w-0")}>
              <CardTitle icon={CalendarDays} title="Agenda ta de azi" />
              {data.today.length === 0 ? (
                <EmptyNote icon={CalendarDays} title="Nicio activitate pentru azi" text="Ziua ta e liberă. Adaugă o activitate ca să începi." />
              ) : (
                <ol className="space-y-2.5">
                  {data.today.map((a) => (
                    <li key={a.id} className="flex min-w-0 items-center gap-3 text-sm">
                      <span className="w-12 shrink-0 font-semibold tabular-nums text-gold-dark">{formatTime(a.startsAt)}</span>
                      <span className="min-w-0 truncate">{a.title}</span>
                    </li>
                  ))}
                </ol>
              )}
              <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-border pt-3 text-sm font-medium">
                <Link to="/app/activities" search={{ new: true }} className="text-primary hover:underline">
                  + Adaugă activitate
                </Link>
                <Link to="/app/activities" className="text-gold-dark hover:underline">
                  Vezi agenda →
                </Link>
              </div>
            </section>
            <HabitooNewsCard className={cn(CARD, "min-w-0")} />
            <DailyNoteCard className={cn(CARD, "min-w-0")} />
          </div>

          {/* 3. Cifre */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Proprietăți active" metric={data.metrics.properties} icon={Building2} to="/app/properties" now={now} />
            <MetricCard label="Cereri active" metric={data.metrics.requests} icon={ClipboardList} to="/app/requests" now={now} />
            <MetricCard label="Lead-uri deschise" metric={data.metrics.leads} icon={Users} to="/app/leads" search={{ deschise: true }} now={now} />
            <MetricCard label="Contacte" metric={data.metrics.contacts} icon={UserRound} to="/app/contacts" now={now} />
          </div>

          {/* 4. Etapele lead-urilor */}
          <section className={CARD}>
            <CardTitle icon={Users} title="Etapele lead-urilor" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {data.stages.map((s) => (
                <Link
                  key={s.stage}
                  to="/app/leads"
                  search={{ stage: s.stage }}
                  className={cn("rounded-xl border px-4 py-3 transition-transform hover:-translate-y-0.5", STAGE_STYLE[s.stage])}
                >
                  <p className="truncate text-sm font-medium">{leadStageLabels[s.stage]}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{s.count}</p>
                </Link>
              ))}
            </div>
          </section>

          {/* 5. Ultimele proprietăți și cereri */}
          <div className="grid gap-4 lg:grid-cols-2">
            <section className={cn(CARD, "min-w-0")}>
              <CardTitle icon={Building2} title="Ultimele proprietăți" action={<SeeAll to="/app/properties" />} />
              {data.latestProperties.length === 0 ? (
                <EmptyNote icon={Building2} title="Nicio proprietate încă." />
              ) : (
                <ul className="divide-y divide-border">
                  {data.latestProperties.map((p) => (
                    <li key={p.id} className="flex min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <PropertyThumb propertyId={p.id} title={p.title} cover={coverFor(p.id)} className="size-14 rounded-xl" />
                      <div className="min-w-0 flex-1">
                        <Link to="/app/properties/$id" params={{ id: p.id }} className="block truncate text-sm font-medium hover:text-primary">
                          {p.title}
                        </Link>
                        <p className="truncate text-sm font-semibold">
                          {p.price !== null ? formatMoney(Number(p.price), p.currency) : "Preț la cerere"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.agent ?? "Fără agent"} · {relativeDays(p.createdAt)}
                        </p>
                      </div>
                      <StatusBadge tone={propertyStatusTone[p.status] ?? "neutral"} className="shrink-0">
                        {propertyStatusLabels[p.status] ?? p.status}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className={cn(CARD, "min-w-0")}>
              <CardTitle icon={Users} title="Ultimele lead-uri" action={<SeeAll to="/app/leads" />} />
              {data.latestLeads.length === 0 ? (
                <EmptyNote icon={Users} title="Niciun lead încă." />
              ) : (
                <ul className="divide-y divide-border">
                  {data.latestLeads.map((l) => (
                    <li key={l.id} className="py-1 first:pt-0 last:pb-0">
                      <Link
                        to="/app/leads"
                        search={{ lead: l.id }}
                        className="flex min-w-0 items-center gap-3 rounded-xl py-2 hover:bg-muted/50"
                      >
                        <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-gold-tint text-gold-dark">
                          <Users className="size-5" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{l.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {leadSourceLabel(l.source)}{l.property ? ` · ${l.property}` : ""}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {l.agent ?? "Fără agent"} · {relativeTime(l.createdAt)}
                          </p>
                        </div>
                        <span className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium", LEAD_STAGE_STYLE[l.stage] ?? LEAD_STAGE_STYLE.lost)}>
                          {leadStageLabels[l.stage as keyof typeof leadStageLabels] ?? l.stage}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
