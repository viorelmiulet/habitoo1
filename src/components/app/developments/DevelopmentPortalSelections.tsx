import {useServerFn} from '@tanstack/react-start';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Checkbox} from '@/components/ui/checkbox';
import {getDevelopmentPortalSelections,setDevelopmentPortalSelection} from '@/lib/developments/portal-selections.functions';
import {UNIT_OPERATION_STARTED,type UnitOperationResult} from '@/lib/developments/unit-operations';
import {toast} from '@/components/ui/sonner';
import {errorMessage} from '@/lib/developments/error-message';
export function DevelopmentPortalSelections({id,editable,storiaConnected}:{id:string;editable:boolean;storiaConnected:boolean}) {
 const load=useServerFn(getDevelopmentPortalSelections),save=useServerFn(setDevelopmentPortalSelection),qc=useQueryClient();
 const q=useQuery({queryKey:['development-portal-selections',id],queryFn:()=>load({data:{id}}),refetchInterval:3000});
 const change=useMutation({mutationFn:({portalKey,enabled}:{portalKey:string;enabled:boolean})=>save({data:{id,portalKey,enabled}}),onSuccess:()=>{toast.success(UNIT_OPERATION_STARTED);void q.refetch();void qc.invalidateQueries({queryKey:['development-publishing',id]});},onError:e=>toast.error(errorMessage(e,'Selecția nu a putut fi salvată.'))});
 const running=q.data?.job&&['queued','running'].includes(q.data.job.status);
 const result=q.data?.job?.result as unknown as UnitOperationResult|undefined;
 return <section className="space-y-3 border-b pb-5"><h2 className="text-lg font-semibold">Portaluri ansamblu</h2>
  {q.isError?<p role="alert" className="text-sm text-destructive">Portalurile ansamblului nu au putut fi citite.</p>:null}
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{q.data?.portals.map(p=>{const enabled=q.data.selections.some(s=>s.portal_key===p.id&&s.enabled);return <label key={p.id} className="flex min-h-11 items-center gap-2"><Checkbox aria-label={p.id==='storia'?'Storia — Cont dezvoltator':p.name} checked={enabled} disabled={!editable||change.isPending||Boolean(running)||(p.id==='storia'&&!storiaConnected&&!enabled)} onCheckedChange={v=>change.mutate({portalKey:p.id,enabled:v===true})}/><span>{p.id==='storia'?'Storia — Cont dezvoltator':p.name}</span></label>;})}</div>
  {q.data?.job?<div className="space-y-2 text-sm"><h3 className="font-medium">Ultima operație — {q.data.job.portal_key}</h3><p>{running?`În curs: ${q.data.job.processed} din ${q.data.job.total}`:`${result?.succeeded?.filter(i=>!('skip' in i&&i.skip)).length??0} unități procesate, ${result?.succeeded?.filter(i=>'skip' in i&&i.skip).length??0} sărite, ${(result?.failed?.length??0)+(q.data.job.status==='error'?q.data.job.total-q.data.job.processed:0)} eșuate.`}</p>{q.data.job.last_error?<p className="text-destructive">{q.data.job.last_error}</p>:null}{result?.failed?.map((i,n)=><p key={n} className="text-destructive">{i.reference??i.propertyId}: {i.reason}</p>)}</div>:null}
 </section>;
}