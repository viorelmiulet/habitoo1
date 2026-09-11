/**
 * Panoul de sinteză al dashboardului: salut, statistici reale, distribuția pe
 * portaluri, proprietăți recente, calendar compact și activitățile zilei.
 * Prezentare doar — datele vin din `useDashboardOverview` (RLS-scoped).
 */
import { Link } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarClock,
  CalendarDays,
  Flame,
  Handshake,
  Home,
  Mail,
  Phone,
  StickyNote,
  Users,
} from "lucide-react";
import { PortalLogo } from "@/components/app/PortalLogo";
import { PropertyThumb, usePropertyCovers } from "@/components/app/PropertyThumb";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDashboardOverview,
  type OverviewDelta,
  type OverviewPortalUsage,
} from "@/hooks/use-dashboard-overview";
import { formatMoney, formatNumber, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const DAY_LABELS = ["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"];

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

const ACTIVITY_ICONS: Record<string, typeof Phone> = {
  call: Phone,
  viewing: Home,
  email: Mail,
  meeting: Users,
  note: StickyNote,
};

function trendOf(delta: OverviewDelta) {
  if (delta.previous <= 0) return delta.current > 0 ? 100 : 0;
  return Math.round(((delta.current - delta.previous) / delta.previous) * 100);
}

function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  tone,
  to,
}: {
  label: string;
  value: number;
  delta?: OverviewDelta;
  icon: typeof Building2;
  tone: string;
  to: string;
}) {
  const trend = delta ? trendOf(delta) : null;
  const up = (trend ?? 0) >= 0;

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-card p-5 ring-1 ring-border/60">
      <div className="flex items-start justify-between gap-3">
        <span className={cn("flex size-10 items-center justify-center rounded-xl", tone)}>
          <Icon className="size-5" aria-hidden />
        </span>
        {trend !== null ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium",
              up ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
            )}
          >
            {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {Math.abs(trend)}%
          </span>
        ) : null}
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-3xl font-medium tracking-tight">{formatNumber(value)}</p>
      </div>
      <Link
        to={to}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        Vezi toate <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}

function PortalDonut({
  published,
  total,
  rows,
}: {
  published: number;
  total: number;
  rows: OverviewPortalUsage[];
}) {
  const sum = rows.reduce((acc, r) => acc + r.count, 0);
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
      <div className="relative size-40 shrink-0">
        <svg viewBox="0 0 140 140" className="size-full -rotate-90">
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="var(--color-muted)"
            strokeWidth="16"
          />
          {sum > 0
            ? rows.map((row, i) => {
                const length = (row.count / sum) * circumference;
                const dash = `${length} ${circumference - length}`;
                const el = (
                  <circle
                    key={row.portalKey}
                    cx="70"
                    cy="70"
                    r={radius}
                    fill="none"
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    strokeWidth="16"
                    strokeDasharray={dash}
                    strokeDashoffset={-offset}
                    strokeLinecap="butt"
                  />
                );
                offset += length;
                return el;
              })
            : null}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-medium">{published}</span>
          <span className="text-xs text-muted-foreground">din {total} publicate</span>
        </div>
      </div>

      <ul className="w-full min-w-0 space-y-2.5">
        {rows.length === 0 ? (
          <li className="text-sm text-muted-foreground">Niciun anunț publicat pe portaluri.</li>
        ) : (
          rows.map((row, i) => (
            <li key={row.portalKey} className="flex items-center gap-3">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
              />
              <PortalLogo portalId={row.portalKey} name={row.displayName} size={20} />
              <span className="min-w-0 flex-1 truncate text-sm">{row.displayName}</span>
              {row.errors > 0 ? (
                <span
                  className="size-2 rounded-full bg-destructive"
                  title={`${row.errors} anunțuri cu eroare`}
                  aria-label={`${row.errors} anunțuri cu eroare`}
                />
              ) : null}
              <span className="text-sm tabular-nums text-muted-foreground">{row.count}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function MiniCalendar() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div>
      <p className="mb-3 text-sm font-medium capitalize">
        {new Intl.DateTimeFormat("ro-RO", { month: "long", year: "numeric" }).format(today)}
      </p>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
        {DAY_LABELS.map((d) => (
          <span key={d} className="py-1">
            {d}
          </span>
        ))}
        {cells.map((day, i) => (
          <span
            key={i}
            className={cn(
              "flex aspect-square items-center justify-center rounded-lg text-xs text-foreground",
              day === null && "text-transparent",
              day === today.getDate() && "bg-primary font-medium text-primary-foreground",
            )}
          >
            {day ?? "·"}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DashboardOverview({
  organizationId,
  firstName,
}: {
  organizationId?: string | null;
  firstName: string;
}) {
  const { data, isLoading } = useDashboardOverview(organizationId);
  const coverFor = usePropertyCovers((data?.recent ?? []).map((p) => p.id));

  const dateLabel = new Intl.DateTimeFormat("ro-RO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
            Bun venit, {firstName}!
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Iată ce se întâmplă azi în agenția ta.
          </p>
        </div>
        <p className="text-sm text-muted-foreground capitalize">{dateLabel}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Proprietăți active"
          value={data.stats.activeProperties.current}
          delta={data.stats.activeProperties}
          icon={Building2}
          tone="bg-primary/10 text-primary"
          to="/app/properties"
        />
        <StatCard
          label="Lead-uri noi (30 zile)"
          value={data.stats.newLeads.current}
          delta={data.stats.newLeads}
          icon={Flame}
          tone="bg-info/10 text-info"
          to="/app/leads"
        />
        <StatCard
          label="Vizionări astăzi"
          value={data.stats.viewingsToday}
          icon={CalendarClock}
          tone="bg-warning/15 text-warning-foreground"
          to="/app/activities"
        />
        <StatCard
          label="Tranzacții câștigate (30 zile)"
          value={data.stats.deals.current}
          delta={data.stats.deals}
          icon={Handshake}
          tone="bg-success/10 text-success"
          to="/app/leads"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className="rounded-2xl bg-card p-5 ring-1 ring-border/60">
            <h2 className="mb-4 text-base font-medium">Proprietăți pe portaluri</h2>
            <PortalDonut
              published={data.portals.published}
              total={data.portals.total}
              rows={data.portals.rows}
            />
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-medium">Proprietăți recente</h2>
              <Link
                to="/app/properties"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Vezi toate <ArrowRight className="size-3.5" />
              </Link>
            </div>
            {data.recent.length === 0 ? (
              <p className="rounded-2xl bg-card p-5 text-sm text-muted-foreground ring-1 ring-border/60">
                Nicio proprietate încă.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {data.recent.map((p) => (
                  <article
                    key={p.id}
                    className="flex flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-border/60"
                  >
                    <div className="relative">
                      <PropertyThumb
                        propertyId={p.id}
                        title={p.title}
                        cover={coverFor(p.id)}
                        className="h-40 w-full rounded-none border-0"
                      />
                      {p.badge ? (
                        <span className="absolute top-2 left-2 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-medium text-primary-foreground">
                          {p.badge}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-1 flex-col gap-2 p-4">
                      <Link
                        to="/app/properties/$id"
                        params={{ id: p.id }}
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {p.title}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">{p.area ?? "—"}</p>
                      <p className="text-base font-medium">
                        {p.price !== null
                          ? formatMoney(p.price, p.currency ?? "EUR")
                          : "Preț la cerere"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[
                          p.surface !== null ? `${formatNumber(p.surface)} m²` : null,
                          p.rooms !== null ? `${p.rooms} camere` : null,
                          p.floor !== null
                            ? `etaj ${p.floor}${p.buildingFloors ? `/${p.buildingFloors}` : ""}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                      {p.portals.length > 0 ? (
                        <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                          {p.portals.map((portal) => (
                            <span
                              key={portal.portalKey}
                              className="relative inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-[11px]"
                            >
                              <PortalLogo
                                portalId={portal.portalKey}
                                name={portal.displayName}
                                size={14}
                              />
                              <span className="max-w-24 truncate">{portal.displayName}</span>
                              {portal.hasError ? (
                                <span
                                  className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-destructive ring-2 ring-card"
                                  aria-label="Eroare de publicare"
                                />
                              ) : null}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl bg-card p-5 ring-1 ring-border/60">
            <MiniCalendar />
          </section>

          <section className="rounded-2xl bg-card p-5 ring-1 ring-border/60">
            <div className="mb-4 flex items-center gap-2">
              <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
              <h2 className="text-base font-medium">Activități de astăzi</h2>
            </div>
            {data.today.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nimic programat astăzi.</p>
            ) : (
              <ul className="space-y-3">
                {data.today.map((a) => {
                  const Icon = ACTIVITY_ICONS[a.kind] ?? CalendarClock;
                  return (
                    <li key={a.id} className="flex gap-3">
                      <span className="w-11 shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
                        {formatTime(a.startsAt)}
                      </span>
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="size-3.5" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{a.title}</span>
                        {a.context ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {a.context}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
