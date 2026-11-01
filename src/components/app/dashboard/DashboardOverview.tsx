/**
 * Panoul de sinteză al dashboardului: salut, statistici reale, agenda zilei,
 * proprietăți recente, distribuția pe portaluri și calendar compact.
 * Prezentare doar — datele vin din `useDashboardOverview` (RLS-scoped).
 */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
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
import { dashboardDateLabel, greetingFor, todaySummary } from "./greeting";

const DAY_LABELS = ["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"];
const CARD = "rounded-[14px] border border-border bg-surface";

function trendOf(delta: OverviewDelta) {
  if (delta.previous <= 0) return delta.current > 0 ? 100 : 0;
  return Math.round(((delta.current - delta.previous) / delta.previous) * 100);
}

function SeeAll({ to }: { to: string }) {
  return (
    <Link
      to={to}
      className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-gold-dark hover:underline"
    >
      Vezi toate <ArrowRight className="size-3.5" />
    </Link>
  );
}

function SectionTitle({ title, to }: { title: string; to?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-base font-bold">{title}</h2>
      {to ? <SeeAll to={to} /> : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  delta,
  to,
  featured,
}: {
  label: string;
  value: number;
  delta?: OverviewDelta;
  to: string;
  featured?: boolean;
}) {
  const trend = delta ? trendOf(delta) : null;
  const up = (trend ?? 0) >= 0;
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-[14px] p-5",
        featured ? "bg-navy text-on-navy dark:border dark:border-border dark:bg-sidebar-accent" : "border border-border bg-surface",
      )}
    >
      <p className={cn("text-[13px]", featured ? "text-on-navy/75" : "text-muted-foreground")}>
        {label}
      </p>
      <div className="flex items-end justify-between gap-2">
        <p className="text-[32px] leading-none font-extrabold tabular-nums">
          {formatNumber(value)}
        </p>
        {trend !== null ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-semibold",
              featured ? "text-gold" : up ? "text-success" : "text-destructive",
            )}
          >
            {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {Math.abs(trend)}%
          </span>
        ) : null}
      </div>
      <Link
        to={to}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-semibold hover:underline",
          featured ? "text-gold" : "text-gold-dark",
        )}
      >
        Vezi toate <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}

function PortalBars({
  published,
  total,
  rows,
}: {
  published: number;
  total: number;
  rows: OverviewPortalUsage[];
}) {
  const max = rows.reduce((acc, r) => Math.max(acc, r.count), 0);
  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        <span className="text-lg font-bold text-foreground">{published}</span> din {total} publicate
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Niciun anunț publicat pe portaluri.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.portalKey} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <PortalLogo portalId={row.portalKey} name={row.displayName} size={18} />
                <span className="min-w-0 flex-1 truncate text-sm">{row.displayName}</span>
                <span className="text-sm font-semibold tabular-nums">{row.count}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-navy dark:bg-gold"
                  style={{ width: `${max > 0 ? (row.count / max) * 100 : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
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
      <p className="mb-3 text-base font-bold capitalize">
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
              day === today.getDate() && "bg-primary font-semibold text-primary-foreground",
            )}
          >
            {day ?? "·"}
          </span>
        ))}
      </div>
    </div>
  );
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn(CARD, "p-5", className)}>{children}</section>;
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
  const now = new Date();

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-72 max-w-full" />
          <Skeleton className="h-4 w-56 max-w-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-[14px]" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Skeleton className="h-72 rounded-[14px]" />
          <Skeleton className="h-72 rounded-[14px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6" data-tour="dashboard-overview">
      <div>
        <h1 className="text-[28px] leading-tight font-bold">
          {greetingFor(now)}, {firstName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {dashboardDateLabel(now)} · {todaySummary(data.today.length)}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          featured
          label="Proprietăți active"
          value={data.stats.activeProperties.current}
          delta={data.stats.activeProperties}
          to="/app/properties"
        />
        <StatCard
          label="Lead-uri noi (30 zile)"
          value={data.stats.newLeads.current}
          delta={data.stats.newLeads}
          to="/app/leads"
        />
        <StatCard label="Vizionări astăzi" value={data.stats.viewingsToday} to="/app/activities" />
        <StatCard
          label="Tranzacții câștigate (30 zile)"
          value={data.stats.deals.current}
          delta={data.stats.deals}
          to="/app/leads"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <SectionTitle title="Agenda de azi" to="/app/activities" />
            {data.today.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nimic programat astăzi.</p>
            ) : (
              <ol className="space-y-3">
                {data.today.map((a) => (
                  <li key={a.id} className="flex items-start gap-3">
                    <span className="w-12 shrink-0 text-sm font-bold tabular-nums">
                      {formatTime(a.startsAt)}
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        a.kind === "viewing" ? "bg-gold" : "bg-muted-foreground/40",
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{a.title}</span>
                      {a.context ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {a.context}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <SectionTitle title="Proprietăți recente" to="/app/properties" />
            {data.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nicio proprietate încă.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {data.recent.map((p) => (
                  <article
                    key={p.id}
                    className="flex min-w-0 flex-col overflow-hidden rounded-[14px] border border-border bg-surface"
                  >
                    <div className="relative">
                      <PropertyThumb
                        propertyId={p.id}
                        title={p.title}
                        cover={coverFor(p.id)}
                        className="h-[130px] w-full rounded-none border-0"
                      />
                      {p.badge ? (
                        <span className="absolute top-2 left-2 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-primary-foreground">
                          {p.badge}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-1 flex-col gap-1 p-3.5">
                      <p className="text-[17px] font-bold">
                        {p.price !== null
                          ? formatMoney(p.price, p.currency ?? "EUR")
                          : "Preț la cerere"}
                      </p>
                      <Link
                        to="/app/properties/$id"
                        params={{ id: p.id }}
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {p.title}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {[
                          p.surface !== null ? `${formatNumber(p.surface)} m²` : null,
                          p.floor !== null
                            ? `etaj ${p.floor}${p.buildingFloors ? `/${p.buildingFloors}` : ""}`
                            : null,
                          p.area,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                      {p.portals.length > 0 ? (
                        <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                          {p.portals.map((portal) => (
                            <span
                              key={portal.portalKey}
                              title={portal.displayName}
                              className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-[11px]"
                            >
                              <PortalLogo
                                portalId={portal.portalKey}
                                name={portal.displayName}
                                size={14}
                              />
                              <span className="max-w-24 truncate">{portal.displayName}</span>
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <SectionTitle title="Portaluri" />
            <PortalBars
              published={data.portals.published}
              total={data.portals.total}
              rows={data.portals.rows}
            />
          </Card>
          <Card>
            <MiniCalendar />
          </Card>
        </div>
      </div>
    </div>
  );
}
