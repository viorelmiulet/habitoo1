import { errorMessage } from '@/lib/developments/error-message';
import {useServerFn} from '@tanstack/react-start';
import {useQuery,useMutation} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
import {toast} from '@/components/ui/sonner';
import {getDevelopmentPublishing,requestDevelopmentPublishing} from '@/lib/portals/storia/development.functions';
import {investmentPublishGate} from '@/lib/portals/storia/investment';
export function DevelopmentPublishing({id,editable}:{id:string;editable:boolean}){
 const load=useServerFn(getDevelopmentPublishing),send=useServerFn(requestDevelopmentPublishing);
 const q=useQuery({queryKey:['development-publishing',id],queryFn:()=>load({data:{id}}),refetchInterval:5000});
 const action=useMutation({mutationFn:(withdraw:boolean)=>send({data:{id,withdraw}}),onSuccess:()=>{toast.success('Operațiunea Storia a fost înscrisă.');void q.refetch();},onError:e=>{console.error(e);toast.error(errorMessage(e,'Operațiunea Storia nu a putut fi înscrisă.'));}});
 const waiting=['pending','sending'].includes(q.data?.publication?.status??'');
 const gate=investmentPublishGate(q.data?.connected===true);const labels:Record<string,string>={draft:'Nepublicat',sending:'Se trimite',pending:'În așteptarea Storia',published:'Publicat',withdrawn:'Retras',error:'Eroare'};
 return <section className="space-y-4 py-4"><h2 className="text-lg font-semibold">Storia — Cont dezvoltator</h2><p>{labels[q.data?.publication?.status??'draft']??q.data?.publication?.status}</p>{q.isError?<p role="alert" className="text-destructive">Starea nu a putut fi citită.</p>:null}{gate?<p className="text-muted-foreground">{gate}</p>:null}{q.data?.publication?.last_error?<p role="alert" className="text-destructive">{q.data.publication.last_error}</p>:null}<p className="text-sm text-muted-foreground">Unitățile se publică pe contul de dezvoltator ca anunțuri separate; anunțurile din contul agenției rămân neschimbate.</p><div className="flex flex-wrap gap-2"><Button disabled={!editable||waiting||Boolean(gate)||action.isPending} onClick={()=>action.mutate(false)}>Publică pe Storia</Button><Button variant="outline" disabled={!editable||action.isPending||!q.data?.publication?.external_uuid} onClick={()=>{if(window.confirm('Retragi ansamblul și unitățile sale de pe Storia?'))action.mutate(true);}}>Retrage</Button></div><div className="overflow-x-auto"><table className="w-full text-sm"><tbody>{q.data?.units.map(u=><tr key={u.id} className="border-b border-border"><td className="py-3">{u.transaction_kind==='sale'?'Vânzare':'Închiriere'}</td><td>{labels[u.status]??u.status}</td><td className="text-destructive">{u.last_error}</td></tr>)}</tbody></table></div></section>;
}
