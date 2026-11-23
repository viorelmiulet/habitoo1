import { useMutation } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { CopyCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAiFeatures } from '@/hooks/use-ai-features';
import { findPossiblePropertyDuplicates } from '@/lib/prospecting/enrichment.functions';
export function PossibleDuplicatesPanel({id,kind}:{id:string;kind:'map'|'property'}){
  const {isEnabled}=useAiFeatures();const find=useServerFn(findPossiblePropertyDuplicates);
  const m=useMutation({mutationFn:()=>find({data:{id,kind}})});
  if(!isEnabled('ai_crm'))return null;
  return <section className="space-y-3 border-b border-border py-4"><Button variant="outline" onClick={()=>m.mutate()} disabled={m.isPending}><CopyCheck className="size-4"/>{m.isPending?'Se compară…':'Caută posibile duplicate'}</Button>
    {m.isError?<p role="alert" className="text-sm text-destructive">Comparația nu a putut fi efectuată.</p>:null}
    {m.data?<><p className="text-xs text-muted-foreground">{m.data.photoNotice}</p>{m.data.matches.length?<ul className="divide-y divide-border">{m.data.matches.map(r=><li key={r.offer.id} className="py-3"><p className="font-semibold">Posibil duplicat · încredere {r.confidence==='high'?'ridicată':'medie'} ({r.score}%)</p><p className="text-sm">{r.offer.href && /^(https:\/\/|\/app\/)/.test(r.offer.href)?<a href={r.offer.href} className="underline" target="_blank" rel="noreferrer">{r.offer.title}</a>:r.offer.title} · {r.offer.source}</p><ul className="text-xs text-muted-foreground">{r.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul></li>)}</ul>:<p className="text-sm text-muted-foreground">Nu au fost identificate posibile duplicate în datele comparate.</p>}</>:null}
  </section>;
}