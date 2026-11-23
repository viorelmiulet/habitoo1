import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useAiFeatures } from '@/hooks/use-ai-features';
import { getListingPriceEstimate } from '@/lib/owner-reports/price.functions';
import { formatMoney } from '@/lib/format';

export function PriceEstimatePanel({propertyId}:{propertyId:string}){
  const {isEnabled}=useAiFeatures();const enabled=isEnabled('acp_ai');
  const get=useServerFn(getListingPriceEstimate);
  const q=useQuery({queryKey:['listing-price-estimate',propertyId],queryFn:()=>get({data:{propertyId}}),enabled});
  if(!enabled)return null;
  const d=q.data;
  return <section className="border-b border-border py-5">
    <h2 className="text-base font-semibold">Estimare din oferte comparabile</h2>
    {q.isPending?<p className="mt-2 text-sm text-muted-foreground">Se încarcă…</p>:q.isError?<p className="mt-2 text-sm text-destructive">Comparabilele nu au putut fi încărcate.</p>:d?.status==='ready'?<>
      <p className="mt-2 text-xl font-semibold">{formatMoney(d.min,d.currency)} – {formatMoney(d.max,d.currency)}</p>
      <p className="text-sm text-muted-foreground">Mediana prețurilor cerute: {formatMoney(d.median,d.currency)}</p>
      <ul className="mt-3 divide-y divide-border">{d.comparables.map(c=><li key={c.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{c.url?<a className="underline" href={c.url} target="_blank" rel="noreferrer">{c.title}</a>:c.title}<span className="block text-xs text-muted-foreground">{c.source} · {c.city}</span></span><span>{formatMoney(c.price,c.currency)}</span></li>)}</ul>
    </>:<p className="mt-2 text-sm text-muted-foreground">Date insuficiente</p>}
    {d?.status==='ready'?<ul className="mt-3 space-y-1 text-xs text-muted-foreground">{d.criteria.map(c=><li key={c}>{c}</li>)}</ul>:null}
  </section>;
}