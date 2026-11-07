import {useState} from 'react';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {Send,RotateCcw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {toast} from '@/components/ui/sonner';
import {partnerWebhookOverview,partnerWebhookAdminAction} from '@/lib/partner-api/webhook.functions';
export function PartnerWebhookPanel({portal}:{portal:string}){
 const [environment,setEnvironment]=useState<'test'|'live'>('live'),qc=useQueryClient();const read=useServerFn(partnerWebhookOverview),act=useServerFn(partnerWebhookAdminAction);
 const key=['partner-webhook',portal,environment];const query=useQuery({queryKey:key,queryFn:()=>read({data:{portal,environment}})});
 const action=useMutation({mutationFn:(action:'test'|'reactivate')=>act({data:{portal,environment,action}}),onSuccess:()=>{qc.invalidateQueries({queryKey:key});toast.success('Acțiunea webhook a fost procesată.');},onError:(e)=>toast.error(e instanceof Error?e.message:'Acțiunea a eșuat.')});
 const w=query.data?.webhook;
 return <section className="mt-4 space-y-3 border-t pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Webhooks</h3><div className="flex gap-1" role="group" aria-label="Mediul webhook">{(['live','test'] as const).map(env=><Button key={env} size="sm" variant={environment===env?'default':'outline'} aria-pressed={environment===env} onClick={()=>setEnvironment(env)}>{env==='test'?'Test · Demo':'Live'}</Button>)}</div></div>
 {query.isError?<p role="alert" className="text-xs text-destructive">Webhooks nu pot fi încărcate.</p>:query.isPending?<p className="text-xs text-muted-foreground">Se încarcă…</p>:!w?<p className="text-xs text-muted-foreground">Webhook neconfigurat.</p>:<><p className="break-all text-xs">{w.url}</p><p className="text-xs text-muted-foreground">{w.status==='active'?'Activ':'Suspendat'} · {w.consecutive_failures} eșecuri consecutive · Ultimul succes: {w.last_success_at?new Date(w.last_success_at).toLocaleString('ro-RO'):'—'}</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={action.isPending||w.status!=='active'} onClick={()=>action.mutate('test')}><Send/>Trimite test</Button><Button size="sm" variant="outline" disabled={action.isPending} onClick={()=>action.mutate('reactivate')}><RotateCcw/>Reactivează</Button></div><ul className="space-y-2">{query.data?.deliveries.data.map(d=><li key={d.id} className="border-t pt-2 text-xs"><p>{d.event} · seq {d.seq} · HTTP {d.http_status??'—'} · {d.duration_ms} ms · încercarea {d.attempt}</p><time className="text-muted-foreground">{new Date(d.occurred_at).toLocaleString('ro-RO')}</time>{d.error&&<p className="text-destructive">{d.error}</p>}</li>)}</ul>{!query.data?.deliveries.data.length&&<p className="text-xs text-muted-foreground">Nicio livrare încă.</p>}</>}
 </section>;
}
