import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPropertyPortalStatistics } from "@/lib/partner-api/feedback.functions";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, CartesianGrid, XAxis, YAxis } from "recharts";
export function PropertyPortalStatistics({ propertyId }: { propertyId: string }) {
  const load = useServerFn(getPropertyPortalStatistics);
  const query = useQuery({ queryKey: ["property-portal-statistics", propertyId], queryFn: () => load({ data: { propertyId } }), refetchInterval: 60000 });
  return <section className="space-y-4 border-t border-border pt-6">
    <h2 className="text-lg font-semibold">Statistici portaluri</h2>
    {query.isError ? <p role="alert" className="text-sm text-destructive">Statisticile nu au putut fi citite.</p> : query.isPending ? <p className="text-sm text-muted-foreground">Se încarcă…</p> : !query.data?.length ? <p className="text-sm text-muted-foreground">Nicio statistică momentan.</p> : query.data.map(row => <div key={row.portal} className="space-y-3">
      <h3 className="font-semibold">{row.name}</h3>
      <dl className="grid grid-cols-3 gap-3 text-sm"><div><dt className="text-muted-foreground">Vizualizări</dt><dd className="text-xl font-semibold tabular-nums">{row.views}</dd></div><div><dt className="text-muted-foreground">Contacte</dt><dd className="text-xl font-semibold tabular-nums">{row.contacts}</dd></div><div><dt className="text-muted-foreground">Favorite</dt><dd className="text-xl font-semibold tabular-nums">{row.favorites}</dd></div></dl>
      <ChartContainer className="h-48 w-full" config={{ views: { label: "Vizualizări", color: "var(--chart-1)" }, contacts: { label: "Contacte", color: "var(--chart-2)" }, favorites: { label: "Favorite", color: "var(--chart-3)" } }}><LineChart data={row.days}><CartesianGrid vertical={false} /><XAxis dataKey="date" tickFormatter={v => String(v).slice(5)} minTickGap={30} /><YAxis allowDecimals={false} width={36} /><ChartTooltip content={<ChartTooltipContent />} /><Line dataKey="views" stroke="var(--color-views)" dot={false} /><Line dataKey="contacts" stroke="var(--color-contacts)" dot={false} /><Line dataKey="favorites" stroke="var(--color-favorites)" dot={false} /></LineChart></ChartContainer>
      <p className="text-xs text-muted-foreground">Ultimele 30 de zile</p>
    </div>)}
  </section>;
}