import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { MessageSquare,Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAiFeatures } from '@/hooks/use-ai-features';
import { generateOwnerApproach } from '@/lib/prospecting/enrichment.functions';
export function OwnerApproachDraft({id,kind}:{id:string;kind:'map'|'argus'}){
  const {isEnabled}=useAiFeatures();const generate=useServerFn(generateOwnerApproach);const [text,setText]=useState('');const [notice,setNotice]=useState('');
  const m=useMutation({mutationFn:()=>generate({data:{id,kind}}),onSuccess:r=>{if(r.ok){setText(r.text);setNotice('');}else setNotice(r.message);},onError:()=>setNotice('Mesajul nu a putut fi generat.')});
  if(!isEnabled('ai_crm'))return null;
  return <div className="space-y-2"><Button variant="outline" disabled={m.isPending} onClick={()=>m.mutate()}><MessageSquare className="size-4"/>{m.isPending?'Se pregătește…':'Mesaj de abordare'}</Button>{notice?<p role="alert" className="text-sm text-muted-foreground">{notice}</p>:null}{text?<><Textarea aria-label="Ciornă mesaj de abordare" value={text} onChange={e=>setText(e.target.value)} rows={7}/><Button variant="outline" size="sm" onClick={()=>navigator.clipboard.writeText(text).then(()=>setNotice('Mesaj copiat.')).catch(()=>setNotice('Copierea nu este disponibilă.'))}><Copy className="size-4"/>Copiază mesajul</Button></>:null}</div>;
}