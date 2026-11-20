import {useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {useQuery,useMutation} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {toast} from '@/components/ui/sonner';
import {getDevelopmentPublishing,requestDevelopmentPublishing} from '@/lib/portals/storia/development.functions';
import {investmentPublishGate,STORIA_MOVE_WARNING} from '@/lib/portals/storia/investment';
export function DevelopmentPublishing({id,editable}:{id:string;editable:boolean}){
 const load=useServerFn(getDevelopmentPublishing),send=useServerFn(requestDevelopmentPublishing);const [confirmed,setConfirmed]=useState(false);
 const q=useQuery({queryKey:['development-publishing',id],queryFn:()=>load({data:{id}}),refetchInterval:5000});
 const action=useMutation({mutationFn:(withdraw:boolean)=>send({data:{id,withdraw,confirmed:confirmed?(q.data?.moves??[]).map(p=>p.id):[]}}),onSuccess:()=>{toast.success('Operațiunea Storia a fost înscrisă.');void q.refetch();},onError:e=>toast.error(e.message)});
 const waiting=['pending','sending'].includes(q.data?.publication?.status??'');
 const gate=investmentPublishGate(q.data?.connected===true);const labels:Record<string,string>={draft:'Nepublicat',sending:'Se trimite',pending:'În așteptarea Storia',published:'Publicat',withdrawn:'Retras',error:'Eroare'};
 return <section className="space-y-4 py-4"><h2 className="text-lg font-semibold">Storia — Cont dezvoltator</h2><p>{labels[q.data?.publication?.status??'draft']??q.data?.publication?.status}</p>{q.isError?<p role="alert" className="text-destructive">Starea nu a putut fi citită.</p>:null}{gate?<p className="text-muted-foreground">{gate}</p>:null}{q.data?.publication?.last_error?<p role="alert" className="text-destructive">{q.data.publication.last_error}</p>:null}{q.data?.moves.length?<label className="flex items-start gap-3"><Checkbox checked={confirmed} onCheckedChange={v=>setConfirmed(v===true)}/><span>{STORIA_MOVE_WARNING}.</span></label>:null}<div className="flex flex-wrap gap-2"><Button disabled={!editable||waiting||Boolean(gate)||action.isPending||Boolean(q.data?.moves.length&&!confirmed)} onClick={()=>action.mutate(false)}>Publică pe Storia</Button><Button variant="outline" disabled={!editable||action.isPending||!q.data?.publication?.external_uuid} onClick={()=>{if(window.confirm('Retragi ansamblul și unitățile sale de pe Storia?'))action.mutate(true);}}>Retrage</Button></div><div className="overflow-x-auto"><table className="w-full text-sm"><tbody>{q.data?.units.map(u=><tr key={u.id} className="border-b border-border"><td className="py-3">{u.transaction_kind==='sale'?'Vânzare':'Închiriere'}</td><td>{labels[u.status]??u.status}</td><td className="text-destructive">{u.last_error}</td></tr>)}</tbody></table></div></section>;
}
