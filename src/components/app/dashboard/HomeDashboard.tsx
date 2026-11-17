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
  FileText,
  Link2,
  PenLine,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import { PortalLogo } from "@/components/app/PortalLogo";
import { getPortalDefinition } from "@/lib/portals/registry";
import { buildRecommendations, type Recommendation } from "./home-recommendations";
import { PropertyThumb, usePropertyCovers } from "@/components/app/PropertyThumb";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HOME_STAGES, useHomeDashboard, type HomeMetric } from "@/hooks/use-home-dashboard";
import { formatMoney, formatTime, relativeDays } from "@/lib/format";
import { leadStageLabels, propertyStatusLabels, propertyStatusTone } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { DailyNoteCard } from "./DailyNoteCard";
import { ExtensionPromoCard } from "./ExtensionPromoCard";
import { HabitooNewsCard } from "./HabitooNewsCard";
import { dashboardDateLabel, greetingFor } from "./greeting";
import { dailyAdditions, leadSourceLabel, monthComparison, relativeTime, trendLabel } from "./home-stats";

const CARD = "rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6";
const MONO = "font-mono text-[11px] tracking-wide text-muted-foreground";

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
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full text-ai" preserveAspectRatio="none" aria-hidden>
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
        <p className="flex min-w-0 items-center gap-2 truncate text-sm text-muted-foreground"><Icon className="size-4 shrink-0" aria-hidden />{label}</p>
        <span className="shrink-0 rounded-md bg-success/10 px-1.5 py-0.5 font-mono text-[11px] text-success">+{series[series.length - 1]} azi</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <span className="font-display text-4xl font-bold tabular-nums">{metric.total}</span>
        <div className="w-28 shrink-0"><Sparkline values={series} /></div>
      </div>
      <p
        className={cn(
          "mt-1 text-xs font-medium",
          trend.tone === "up" ? "text-success" : trend.tone === "down" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {trend.text}
      </p>
    </Link>
  );
}

const KIND_BAR: Record<string, string> = {
  viewing: "bg-ai",
  call: "bg-gold",
  meeting: "bg-success",
};

const REC_ICON: Record<Recommendation["kind"], typeof Users> = { matches: Link2, incomplete: FileText, caps: PenLine };

function RecommendationRow({ rec }: { rec: Recommendation }) {
  const Icon = REC_ICON[rec.kind];
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-background/40 p-4 sm:flex-row sm:items-center">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-ai/10 text-ai"><Icon className="size-4" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{rec.title}</p>
        <p className="text-sm text-muted-foreground">{rec.text}</p>
      </div>
      <Button asChild variant="outline" size="sm" className="shrink-0 border-ai/50 text-ai hover:bg-ai/10 hover:text-ai">
        {rec.kind === "matches"
          ? <Link to="/app/potriviri-noi">{rec.action}</Link>
          : <Link to="/app/properties/$id" params={{ id: rec.propertyId }}>{rec.action}</Link>}
      </Button>
    </li>
  );
}

function portalLabel(key: string) {
  return getPortalDefinition(key)?.display_name ?? key;
}

export function HomeDashboard({ organizationId, firstName }: { organizationId?: string | null; firstName: string }) {
  const { data, isLoading } = useHomeDashboard(organizationId);
  const coverFor = usePropertyCovers((data?.latestProperties ?? []).map((p) => p.id));
  const now = new Date();
  const recs = data ? buildRecommendations({ properties: data.recProperties, matches: data.newMatches }) : [];
  const maxStage = Math.max(1, ...(data?.stages ?? []).map((s) => s.count));

  return (
    <div className="min-w-0 space-y-6" data-tour="dashboard-overview">
      {/* Extensia Chrome Habitoo Catch – primul element, vizibil și în starea de încărcare */}
      <ExtensionPromoCard />

      {/* 1. Antet: dată, salut, recomandări */}
      <header className="min-w-0">
        <p className="font-mono text-xs tracking-[0.14em] text-muted-foreground uppercase">{dashboardDateLabel(now)}</p>
        <h1 className="mt-1 text-2xl font-bold text-balance sm:text-3xl">{greetingFor(now)}, {firstName}</h1>
        <p className="mt-1 text-muted-foreground">
          {data
            ? recs.length
              ? <>Agentul AI a pregătit <strong className="text-ai">{recs.length} {recs.length === 1 ? "recomandare" : "recomandări"}</strong> pentru tine.</>
              : "Totul e la zi."
            : "Se pregătesc recomandările…"}
        </p>
      </header>

      {isLoading || !data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">{[0, 1].map((i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}</div>
        </div>
      ) : (
        <>
          {/* 3. Indicatori */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Proprietăți active" metric={data.metrics.properties} icon={Building2} to="/app/properties" now={now} />
            <MetricCard label="Lead-uri deschise" metric={data.metrics.leads} icon={Users} to="/app/leads" search={{ deschise: true }} now={now} />
            <MetricCard label="Cereri active" metric={data.metrics.requests} icon={ClipboardList} to="/app/requests" now={now} />
            <MetricCard label="Contacte" metric={data.metrics.contacts} icon={UserRound} to="/app/contacts" now={now} />
          </div>

          {/* 4. Recomandări + 5. Agenda */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <section className={cn(CARD, "min-w-0 border-ai/30")} data-testid="home-recommendations">
              <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-base font-semibold"><Sparkles className="size-4 text-ai" aria-hidden />Agentul AI recomandă</h2>
                <span className={MONO}>reguli din datele tale</span>
              </div>
              {recs.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Totul e la zi.</p>
              ) : (
                <ul className="space-y-3">{recs.map((r) => <RecommendationRow key={r.kind} rec={r} />)}</ul>
              )}
            </section>

            <section className={cn(CARD, "min-w-0")}>
              <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
                <h2 className="text-base font-semibold">Agenda de azi</h2>
                <Link to="/app/calendar" className="shrink-0 text-sm font-medium text-primary hover:underline">Calendar →</Link>
              </div>
              {data.today.length === 0 ? (
                <EmptyNote icon={CalendarDays} title="Nicio activitate pentru azi" text="Ziua ta e liberă. Adaugă o activitate ca să începi." />
              ) : (
                <ol className="divide-y divide-border">
                  {data.today.map((a) => (
                    <li key={a.id} className="flex min-w-0 gap-4 py-3 first:pt-0 last:pb-0">
                      <span className="w-12 shrink-0 pt-0.5 font-mono text-xs tabular-nums text-muted-foreground">{formatTime(a.startsAt)}</span>
                      <span aria-hidden className={cn("w-0.5 shrink-0 rounded-full", KIND_BAR[a.kind] ?? "bg-muted-foreground/50")} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{a.title}</p>
                        {a.description ? <p className="truncate text-sm text-muted-foreground">{a.description}</p> : null}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          {/* 6. Pipeline + 7. Portaluri */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <section className={cn(CARD, "min-w-0")}>
              <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
                <h2 className="text-base font-semibold">Pipeline lead-uri</h2>
                <Link to="/app/leads" className="shrink-0 text-sm font-medium text-primary hover:underline">Toate lead-urile →</Link>
              </div>
              <ul className="space-y-3">
                {data.stages.map((s) => (
                  <li key={s.stage}>
                    <Link to="/app/leads" search={{ stage: s.stage }} className="grid grid-cols-[6.5rem_minmax(0,1fr)_2rem] items-center gap-3 text-sm hover:text-primary">
                      <span className="truncate">{leadStageLabels[s.stage]}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-ai" style={{ width: `${(s.count / maxStage) * 100}%` }} />
                      </span>
                      <span className="text-right font-mono text-xs tabular-nums">{s.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section className={cn(CARD, "min-w-0")}>
              <h2 className="mb-4 text-base font-semibold">Publicări pe portaluri</h2>
              {data.portals.length === 0 ? (
                <EmptyNote icon={Building2} title="Nicio publicare activă pe portaluri." />
              ) : (
                <ul className="space-y-2.5">
                  {data.portals.map((p) => {
                    const tone = p.errors ? "bg-destructive" : p.pending ? "bg-gold" : "bg-success";
                    return (
                      <li key={p.portalKey} className="flex min-w-0 items-center gap-3 text-sm">
                        <span className="flex h-8 w-24 shrink-0 items-center justify-center rounded-lg bg-plate px-2">
                          <PortalLogo portalId={p.portalKey} name={portalLabel(p.portalKey)} size={24} className="border-0" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground">
                          <span className="text-foreground">{portalLabel(p.portalKey)}</span> · {p.active} active
                          {p.pending ? ` · ${p.pending} în așteptare` : ""}
                          {p.errors ? ` · ${p.errors} ${p.errors === 1 ? "eroare" : "erori"}${p.lastError ? `: ${p.lastError.slice(0, 80)}` : ""}` : ""}
                        </span>
                        <span aria-label={p.errors ? "Eroare" : p.pending ? "În așteptare" : "OK"} className={cn("size-2 shrink-0 rounded-full", tone)} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <HabitooNewsCard className={cn(CARD, "min-w-0")} />
            <DailyNoteCard className={cn(CARD, "min-w-0")} />
          </div>
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
