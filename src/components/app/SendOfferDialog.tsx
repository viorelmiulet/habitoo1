import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Check, Copy, Mail, MessageCircle, Send, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/sonner';
import { getOfferClientDraft, previewOfferClientSend, sendOfferClient } from '@/lib/offer-client.functions';
import { offerMessage, OFFER_CHANNEL_LABELS, type OfferChannel } from '@/lib/offer-client';
import { geographyKey } from '@/lib/private-listing-geography';

export function SendOfferDialog({propertyId,open,onOpenChange}:{propertyId:string;open:boolean;onOpenChange:(open:boolean)=>void}){
 const load=useServerFn(getOfferClientDraft),preview=useServerFn(previewOfferClientSend),send=useServerFn(sendOfferClient);
 const qc=useQueryClient();
 const draft=useQuery({queryKey:['offer-client-draft',propertyId],queryFn:()=>load({data:{propertyId}}),enabled:open,staleTime:0});
 const [channel,setChannel]=useState<OfferChannel>('whatsapp'),[selected,setSelected]=useState(''),[query,setQuery]=useState(''),[phone,setPhone]=useState(''),[email,setEmail]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[handoff,setHandoff]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
 const key=useRef(''),lock=useRef(false),opened=useRef(false),initialized=useRef(false);
 const client=draft.data?.recipients.find(c=>c.key===selected);
 useEffect(()=>{if(open&&!opened.current){initialized.current=false;key.current=crypto.randomUUID();setChannel('whatsapp');setSelected('');setQuery('');setPhone('');setEmail('');setHandoff(false);setError('');setDone(false);setMessage('');}opened.current=open;},[open]);
 useEffect(()=>{if(open&&draft.data&&!initialized.current){setMessage(draft.data.message);initialized.current=true;}},[open,draft.data]);
 const payload=()=>({propertyId,channel,recipient:channel==='email'?email:phone,message,sendKey:key.current,contactId:client?.contactId??null,leadId:client?.leadId??null});
 const finish=async()=>{const result=await send({data:{...payload(),confirmed:true}});await Promise.all([qc.invalidateQueries({queryKey:['property',propertyId]}),qc.invalidateQueries({queryKey:['activities']}),qc.invalidateQueries({queryKey:['contact']}),qc.invalidateQueries({queryKey:['lead-detail']}),qc.invalidateQueries({queryKey:['lead']})]);setDone(true);toast.success(channel==='email'?'Oferta a fost trimisă.':'Activitatea „Ofertă trimisă” a fost salvată.');return result;};
 const action=async(confirm=false)=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{
   if(confirm||channel==='email'){await finish();return;}
   // Open the window synchronously to avoid popup blocking during validation.
   const popup=channel==='whatsapp'?window.open('about:blank','_blank'):null;
   try{const plan=await preview({data:payload()});
    if(channel==='copy'){await navigator.clipboard.writeText(plan.link);await finish();}
    else if(plan.url){if(channel==='whatsapp'){if(!popup)throw new Error('Permite deschiderea WhatsApp în browser.');popup.opener=null;popup.location.href=plan.url;}else window.location.href=plan.url.replace('?body=',/iPhone|iPad/.test(navigator.userAgent)?'&body=':'?body=');setHandoff(true);}
   }catch(e){popup?.close();throw e;}
  }catch(e){setError(e instanceof Error?e.message:'Oferta nu a putut fi trimisă.');}finally{lock.current=false;setBusy(false);}
 };
 const disabled=busy||done||handoff;
 return <Dialog open={open} onOpenChange={v=>{if(!busy)onOpenChange(v);}}><DialogContent aria-describedby={undefined} className="flex h-dvh max-h-dvh max-w-none flex-col rounded-none p-4 sm:h-auto sm:max-h-[90dvh] sm:max-w-2xl sm:rounded-lg"><DialogHeader className="shrink-0 pr-8"><DialogTitle>Trimite oferta</DialogTitle></DialogHeader><div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
 {draft.isLoading?<p className="text-sm text-muted-foreground">Se încarcă oferta…</p>:draft.isError?<p role="alert" className="text-sm text-destructive">Oferta nu poate fi încărcată.</p>:draft.data?<>
 <p className="font-medium">{draft.data.property.title}</p>{draft.data.reason?<p role="alert" className="text-sm text-destructive">{draft.data.reason}</p>:<>
 <div className="space-y-2"><Label htmlFor="offer-recipient-search">Client</Label><Input id="offer-recipient-search" placeholder="Caută în contacte și lead-uri" value={query} disabled={disabled} onChange={e=>setQuery(e.target.value)}/>{query&&<div className="max-h-36 overflow-y-auto rounded border border-border">{draft.data.recipients.filter(c=>geographyKey([c.name,c.phone,c.email].join(' ')).includes(geographyKey(query))).map(c=><Button type="button" variant="ghost" key={c.key} disabled={disabled} className="h-auto w-full justify-start whitespace-normal text-left" onClick={()=>{setSelected(c.key);setQuery('');setPhone(c.phone??'');setEmail(c.email??'');setMessage(offerMessage(draft.data.property,draft.data.agentName,draft.data.agencyName,c.name));}}>{c.name}<span className="ml-auto text-xs text-muted-foreground">{c.leadId?'Lead':'Contact'}</span></Button>)}</div>}{client&&<div className="flex items-center justify-between gap-2 text-sm"><span>{client.name}</span><Button variant="ghost" size="sm" disabled={disabled} onClick={()=>setSelected('')}>Schimbă clientul</Button></div>}</div>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="offer-phone">Telefon</Label><Input id="offer-phone" type="tel" value={phone} disabled={disabled} placeholder="+40…" onChange={e=>setPhone(e.target.value)}/></div><div className="space-y-2"><Label htmlFor="offer-email">Email</Label><Input id="offer-email" type="email" value={email} disabled={disabled} placeholder="Emailul clientului" onChange={e=>setEmail(e.target.value)}/></div></div>
 <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Canal">{(['whatsapp','email','sms','copy'] as const).map(c=>{const Icon=c==='whatsapp'?MessageCircle:c==='email'?Mail:c==='sms'?Smartphone:Copy;return <Button key={c} variant={channel===c?'secondary':'outline'} disabled={disabled} aria-pressed={channel===c} onClick={()=>setChannel(c)} className="px-2 text-xs"><Icon className="size-4 shrink-0"/>{OFFER_CHANNEL_LABELS[c]}</Button>;})}</div>
 <div className="space-y-2"><Label htmlFor="offer-message">Mesaj</Label><Textarea id="offer-message" rows={8} disabled={disabled} value={message} onChange={e=>setMessage(e.target.value)}/></div><a href={draft.data.link} target="_blank" rel="noopener noreferrer" className="block break-all text-xs text-primary underline">{draft.data.link}</a>
 </>}
 </>:null}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{handoff&&!done&&<p className="text-sm text-muted-foreground">După ce trimiți mesajul, confirmă aici pentru a salva activitatea.</p>}{done&&<p role="status" className="flex items-center gap-2 text-sm text-success"><Check className="size-4"/>Activitatea a fost salvată.</p>}
 </div><div className="flex shrink-0 justify-end gap-2 border-t border-border pt-3"><Button variant="outline" disabled={busy} onClick={()=>onOpenChange(false)}>{done?'Închide':'Anulează'}</Button>{!done&&<Button disabled={busy||draft.isLoading||!draft.data||Boolean(draft.data.reason)} onClick={()=>void action(handoff)}><Send className="size-4"/>{busy?'Se procesează…':handoff?'Am trimis mesajul':channel==='copy'?'Copiază linkul':channel==='email'?'Trimite emailul':`Deschide ${OFFER_CHANNEL_LABELS[channel]}`}</Button>}</div></DialogContent></Dialog>;
}
