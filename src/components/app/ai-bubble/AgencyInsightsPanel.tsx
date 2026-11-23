import { useState } from 'react';
import { useQuery,useMutation } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Building2,Search } from 'lucide-react';
import { Dialog,DialogContent,DialogHeader,DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAiFeatures } from '@/hooks/use-ai-features';
import { agencyInsightsStatus,getAgencyInsight } from '@/lib/ai/agents/manager/agency-insights.functions';
import { agencyQueryFor,type AgencyQuery } from '@/lib/ai/agents/manager/agency-insights';
export function AgencyInsightsPanel(){
  const {isEnabled}=useAiFeatures();const enabled=isEnabled('ai_manager');const status=useServerFn(agencyInsightsStatus);const get=useServerFn(getAgencyInsight);
  const q=useQuery({queryKey:['agency-insights-status'],queryFn:()=>status(),enabled});
  const [open,setOpen]=useState(false);const [question,setQuestion]=useState('');const [notice,setNotice]=useState('');
  const m=useMutation({mutationFn:(query:AgencyQuery)=>get({data:{query}})});
  if(!enabled || !q.data?.allowed)return null;
  const ask=()=>{const query=agencyQueryFor(question);if(!query){setNotice('Întrebarea nu corespunde rapoartelor disponibile.');return;}setNotice('');m.mutate(query);};
  return <><Button role="menuitem" variant="ghost" className="w-full justify-start" onClick={()=>setOpen(true)}><Building2 className="size-4 text-ai"/>Întrebări despre agenție</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Asistent pentru administrator</DialogTitle></DialogHeader><form onSubmit={e=>{e.preventDefault();ask();}} className="flex gap-2"><Input aria-label="Întrebare despre agenție" value={question} onChange={e=>setQuestion(e.target.value)}/><Button type="submit" size="icon" aria-label="Caută răspunsul" disabled={m.isPending}><Search className="size-4"/></Button></form><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={m.isPending} onClick={()=>{setQuestion('Cine are lead-uri neatinse?');m.mutate('untouched_leads');}}>Lead-uri neatinse</Button><Button variant="outline" disabled={m.isPending} onClick={()=>{setQuestion('Ce anunțuri n-au avut lead-uri luna asta?');m.mutate('properties_without_leads');}}>Anunțuri fără lead-uri</Button></div>{notice || m.isError?<p role="alert" className="text-sm text-destructive">{notice || 'Răspunsul nu a putut fi încărcat.'}</p>:null}{m.data?<><h3 className="font-semibold">{m.data.title}</h3><p className="text-xs text-muted-foreground">{m.data.period}</p><ul className="space-y-2">{m.data.items.map(i=><li key={i.id}><a className="text-sm underline" href={i.href}>{i.label}</a></li>)}</ul>{!m.data.items.length?<p className="text-sm text-muted-foreground">Niciun rezultat.</p>:null}</>:null}</DialogContent></Dialog></>;
}