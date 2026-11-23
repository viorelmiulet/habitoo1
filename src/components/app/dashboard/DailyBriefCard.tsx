import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { CalendarCheck,RefreshCw,Sparkles,Clock,X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { getDailyBrief,setHomeActionPreference } from '@/lib/daily-brief/daily-brief.functions';
import { briefDate } from '@/lib/daily-brief/brief';
export function DailyBriefCard({userId,organizationId}:{userId:string;organizationId:string}){
 const [agent,setAgent]=useState('all');const [all,setAll]=useState(false);
 const load=useServerFn(getDailyBrief);const save=useServerFn(setHomeActionPreference);const client=useQueryClient();
 const filter=agent==='all'?{}:{agentId:agent};const key=['daily-brief',userId,organizationId,briefDate(new Date()),agent];
 const query=useQuery({queryKey:key,queryFn:()=>load({data:filter}),staleTime:60000,retry:false});
 const refresh=useMutation({mutationFn:()=>load({data:{...filter,refresh:true}}),onSuccess:data=>client.setQueryData(key,data)});
 const preference=useMutation({mutationFn:(v:{actionId:string;mode:'snooze'|'ignore'})=>save({data:{...v,...filter}}),onSuccess:()=>refresh.mutate()});
 const data=query.data?.data;const actions=data?.actions??[];
 return <section id="home-actions" aria-label="Top acțiuni" className="min-w-0 border-b border-border py-5 sm:py-6">
 <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-semibold"><CalendarCheck className="size-5 text-gold-dark"/>Top acțiuni</h2><div className="flex flex-wrap gap-2">
 {data?.isAdmin?<Select value={agent} onValueChange={setAgent}><SelectTrigger className="w-52" aria-label="Filtrează după agent"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Toată agenția</SelectItem>{data.agents.map(a=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>:null}
 <Button variant="outline" size="sm" disabled={query.isPending||refresh.isPending} onClick={()=>refresh.mutate()}><RefreshCw className="size-4"/>Actualizează</Button></div></div>
 {query.isPending?<Skeleton className="mt-4 h-32"/>:null}
 {query.isError||refresh.isError||preference.isError?<p role="alert" className="mt-3 text-sm text-destructive">Acțiunile nu au putut fi actualizate. Încearcă din nou.</p>:null}
 {query.data?.sentence?<p className="mt-3 flex items-start gap-2 text-sm"><Sparkles className="mt-0.5 size-4 shrink-0 text-gold-dark"/>{query.data.sentence}</p>:null}
 {data&&!actions.length?<p className="mt-4 text-sm text-muted-foreground">Nimic de rezolvat acum.</p>:null}
 <ol className="mt-4 divide-y divide-border">{(all?actions:actions.slice(0,5)).map((a,i)=><li key={a.id} className="flex min-w-0 flex-col gap-3 py-4 sm:flex-row sm:items-start"><span className="hidden w-6 shrink-0 pt-1 text-sm font-semibold text-gold-dark sm:block">{i+1}.</span><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{a.title}</p><p className="mt-1 break-words text-sm text-muted-foreground">{a.reason}</p></div><div className="flex shrink-0 flex-wrap gap-2 sm:max-w-80 sm:justify-end"><Button asChild variant="outline" size="sm"><Link to={a.to} search={a.search as never}>{a.button}</Link></Button><Button variant="ghost" size="sm" disabled={preference.isPending||refresh.isPending} onClick={()=>preference.mutate({actionId:a.id,mode:'snooze'})}><Clock className="size-4"/>Amână 1 zi</Button><Button variant="ghost" size="sm" disabled={preference.isPending||refresh.isPending} onClick={()=>preference.mutate({actionId:a.id,mode:'ignore'})}><X className="size-4"/>Ignoră</Button></div></li>)}</ol>
 {actions.length>5?<Button className="mt-3" variant="ghost" size="sm" onClick={()=>setAll(!all)}>{all?'Arată primele 5':`Vezi toate (${actions.length})`}</Button>:null}
 </section>;
}
