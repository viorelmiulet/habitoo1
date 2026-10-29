import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getZupListingStatus } from "@/lib/portals/zup/status.functions";
import { zupStatusLabel } from "@/lib/portals/zup/publish";
export function ZupStatusPanel({organizationId,propertyId}:{organizationId?:string;propertyId:string}) {
  const run=useServerFn(getZupListingStatus);const q=useQuery({queryKey:["zup-status",organizationId??null,propertyId],queryFn:()=>run({data:{propertyId,...(organizationId?{organizationId}:{})}}),staleTime:60_000,refetchInterval:60_000});
  return <div className="mt-2 space-y-1 text-xs text-muted-foreground">
    {q.error?<p role="alert" className="text-destructive">{q.error.message}</p>:null}
    {(q.data??[]).map(r=><div key={r.transaction}><span className="font-medium text-foreground">{r.transaction==="sale"?"Vânzare":"Închiriere"}: {zupStatusLabel(r.status)}</span>{r.error?<p className="text-destructive">{r.error}</p>:null}{r.url&&r.status.toLowerCase()==="active"?<a className="pointer-events-auto text-primary underline" href={r.url} target="_blank" rel="noopener noreferrer">Vezi anunțul</a>:null}</div>)}
  </div>;
}