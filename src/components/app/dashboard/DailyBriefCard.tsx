import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarCheck, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getDailyBrief } from "@/lib/daily-brief/daily-brief.functions";
import { BRIEF_LABELS, briefDate, briefIsEmpty } from "@/lib/daily-brief/brief";

export function DailyBriefCard({ userId, organizationId }: { userId: string; organizationId: string }) {
  const load = useServerFn(getDailyBrief);
  const client = useQueryClient();
  const key = ["daily-brief", userId, organizationId, briefDate(new Date())];
  const query = useQuery({ queryKey: key, queryFn: () => load({ data: {} }), staleTime: Infinity, retry: false });
  const refresh = useMutation({ mutationFn: () => load({ data: { refresh: true } }), onSuccess: data => client.setQueryData(key, data) });
  const brief = query.data?.data;
  return <section aria-label="Azi" className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><CalendarCheck className="size-5 text-gold-dark" />Azi</h2>
      <Button variant="outline" size="sm" disabled={query.isPending || refresh.isPending} onClick={() => refresh.mutate()}><RefreshCw className="size-4" />Actualizează</Button>
    </div>
    {query.isPending ? <Skeleton className="mt-4 h-32" /> : query.isError ? <p role="alert" className="mt-3 text-sm text-destructive">Rezumatul nu a putut fi încărcat. Încearcă Actualizează.</p> : null}
    {refresh.isError ? <p role="alert" className="mt-3 text-sm text-destructive">Datele nu au putut fi actualizate.</p> : null}
    {brief ? <>
      {query.data?.sentence ? <p className="mt-3 flex items-start gap-2 text-sm"><Sparkles className="mt-0.5 size-4 shrink-0 text-gold-dark" />{query.data.sentence}</p> : null}
      {briefIsEmpty(brief.counts) ? <p className="mt-4 text-sm text-muted-foreground">Nimic de rezolvat acum. O zi liniștită!</p> : <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">{Object.entries(BRIEF_LABELS).map(([kind, label]) => <div key={kind} className="flex min-w-0 items-center justify-between gap-3 border-b border-border py-2 text-sm"><dt>{label}</dt><dd className="shrink-0 font-semibold tabular-nums">{brief.counts[kind as keyof typeof brief.counts]}</dd></div>)}</dl>
        <div><h3 className="text-sm font-semibold">Top 5 acțiuni</h3><ol className="mt-2 space-y-1">{brief.actions.map((a,i) => <li key={`${a.kind}-${i}`}><Link to={a.to} search={a.search as never} className="flex min-w-0 gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted"><span className="shrink-0 text-gold-dark">{i+1}.</span><span className="min-w-0 break-words">{a.label}</span></Link></li>)}</ol></div>
      </div>}
      {brief.team ? <div className="mt-5 border-t border-border pt-4"><h3 className="text-sm font-semibold">Echipă</h3>{brief.team.length ? <ul className="mt-2 divide-y divide-border">{brief.team.map(a => <li key={a.userId} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span className="break-words font-medium">{a.name}</span><span className="text-muted-foreground">{a.inactive ? "Fără activitate în ultimele 3 zile · " : ""}{a.portalErrors} erori pe portaluri</span></li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">Niciun agent în echipă.</p>}</div> : null}
    </> : null}
  </section>;
}