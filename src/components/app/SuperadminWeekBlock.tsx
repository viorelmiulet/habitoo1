import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { portalOpsHint, weekDelta, type DeltaTone, type SuperadminWeek } from "@/lib/superadmin-week";
import { cn } from "@/lib/utils";

const toneCls: Record<DeltaTone, string> = {
  up: "text-success",
  down: "text-destructive",
  flat: "text-muted-foreground",
};

export function WeekBlock({ week, loading }: { week: SuperadminWeek | undefined; loading: boolean }) {
  return (
    <section className="space-y-3" data-testid="superadmin-week">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-base font-bold">Ultimele 7 zile</h2>
        <span className="text-[13px] text-muted-foreground">comparat cu săptămâna anterioară</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {loading || !week ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-[14px]" />)
        ) : (
          <>
            <WeekCard featured label="Agenții active" value={formatNumber(week.activeAgencies)} hint={`${formatNumber(week.paidAgencies)} plătite · ${formatNumber(week.trialAgencies)} în trial`} />
            <WeekCard label="Utilizatori activi" value={`${formatNumber(week.activeUsers)} din ${formatNumber(week.totalUsers)}`} hint="autentificați în ultimele 7 zile" />
            <DeltaCard label="Proprietăți noi" current={week.newProperties} previous={week.newPropertiesPrev} />
            <WeekCard label="Operațiuni pe portaluri" value={formatNumber(week.portalSuccess)} hint={portalOpsHint(week.portalSuccess, week.portalFailed)} />
          </>
        )}
      </div>
    </section>
  );
}

function DeltaCard({ label, current, previous }: { label: string; current: number; previous: number }) {
  const d = weekDelta(current, previous);
  return <WeekCard label={label} value={formatNumber(current)} hint={d.label} hintCls={cn("font-semibold", toneCls[d.tone])} />;
}

function WeekCard({ label, value, hint, hintCls, featured }: { label: string; value: string; hint: string; hintCls?: string; featured?: boolean }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 rounded-[14px] p-5", featured ? "bg-navy text-on-navy dark:border dark:border-border dark:bg-sidebar-accent" : "border border-border bg-surface")}>
      <p className={cn("text-[13px]", featured ? "text-on-navy/75" : "text-muted-foreground")}>{label}</p>
      <p className="text-[32px] leading-none font-extrabold tabular-nums">{value}</p>
      <p className={cn("text-xs", featured ? "text-on-navy/75" : "text-muted-foreground", hintCls)}>{hint}</p>
    </div>
  );
}
