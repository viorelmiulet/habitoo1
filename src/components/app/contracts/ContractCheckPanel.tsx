import { useMutation } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAiFeatures } from '@/hooks/use-ai-features';
import { checkContractBeforeSigning } from '@/lib/contracts/check.functions';
export function ContractCheckPanel({id}:{id:string}){
  const {isEnabled}=useAiFeatures();const check=useServerFn(checkContractBeforeSigning);
  const m=useMutation({mutationFn:()=>check({data:{id}})});
  if(!isEnabled('ai_crm'))return null;
  return <section className="space-y-3 border-y border-border py-4"><Button variant="outline" disabled={m.isPending} onClick={()=>m.mutate()}><ListChecks className="size-4"/>{m.isPending?'Se verifică…':'Verifică înainte de semnare'}</Button>
  {m.isError?<p role="alert" className="text-sm text-destructive">Verificarea nu a putut fi efectuată.</p>:null}
  {m.data?<><p className="text-xs text-muted-foreground">{m.data.checked} comparații cu sursele disponibile</p>{m.data.issues.length?<ul className="space-y-2">{m.data.issues.map((i,index)=><li key={`${i.field}:${index}`} className="text-sm"><span className={i.kind==='mismatch'?'font-semibold text-destructive':'text-muted-foreground'}>{i.message}</span><span className="block text-xs text-muted-foreground">Sursă: {i.source}</span></li>)}</ul>:<p className="text-sm">Nu au fost identificate nepotriviri în câmpurile comparate.</p>}</>:null}</section>;
}