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
import { OFFER_CHANNEL_LABELS, type OfferChannel } from '@/lib/offer-client';
import { collaboratorMessage } from '@/lib/neutral-offer';
import { createCollaboratorOfferLink, getCollaboratorOfferDraft, previewCollaboratorOfferSend, revokeCollaboratorOfferLink, sendCollaboratorOffer } from '@/lib/neutral-offer.functions';
import { geographyKey } from '@/lib/private-listing-geography';

export function SendCollaboratorOfferDialog({propertyId,open,onOpenChange}:{propertyId:string;open:boolean;onOpenChange:(open:boolean)=>void}){
 const load=useServerFn(getCollaboratorOfferDraft),preview=useServerFn(previewCollaboratorOfferSend),send=useServerFn(sendCollaboratorOffer);
 const create=useServerFn(createCollaboratorOfferLink),revoke=useServerFn(revokeCollaboratorOfferLink);
 const qc=useQueryClient();
 const [code,setCode]=useState<string|null>(null),[link,setLink]=useState('');
 const draft=useQuery({queryKey:['collaborator-offer-draft',propertyId],queryFn:()=>load({data:{propertyId}}),enabled:open,staleTime:0});
 const [channel,setChannel]=useState<OfferChannel>('whatsapp'),[selected,setSelected]=useState(''),[query,setQuery]=useState(''),[phone,setPhone]=useState(''),[email,setEmail]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[handoff,setHandoff]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
 const key=useRef(''),lock=useRef(false),opened=useRef(false),initialized=useRef(false);
 const client=draft.data?.recipients.find(c=>c.user_id===selected);
 useEffect(()=>{if(open&&!opened.current){initialized.current=false;key.current=crypto.randomUUID();setChannel('whatsapp');setSelected('');setQuery('');setPhone('');setEmail('');setHandoff(false);setError('');setDone(false);setMessage('');setCode(null);setLink('');}opened.current=open;},[open]);
 useEffect(()=>{if(open&&draft.data&&!draft.isFetching&&!initialized.current){if(draft.data.code&&draft.data.link){setCode(draft.data.code);setLink(draft.data.link);setMessage(collaboratorMessage(draft.data.property,draft.data.link));}initialized.current=true;}},[open,draft.data,draft.isFetching]);
 const payload=()=>({propertyId,channel,recipient:channel==='email'?email:phone,message,sendKey:key.current,code:code??'',recipientAgentId:client?.user_id??null,recipientName:client?`${client.full_name} — ${client.agency_name}`:email||phone||'Destinatar manual'});
 const finish=async()=>{const result=await send({data:{...payload(),confirmed:true}});await Promise.all([qc.invalidateQueries({queryKey:['property',propertyId]}),qc.invalidateQueries({queryKey:['activities']}),qc.invalidateQueries({queryKey:['collaborator-offer-draft',propertyId]})]);setDone(true);toast.success(channel==='email'?'Oferta a fost trimisă.':'Activitatea „Ofertă trimisă colaboratorului” a fost salvată.');return result;};
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
 return <Dialog open={open} onOpenChange={v=>{if(!busy)onOpenChange(v);}}><DialogContent aria-describedby={undefined} className="flex h-dvh max-h-dvh max-w-none flex-col rounded-none p-4 sm:h-auto sm:max-h-[90dvh] sm:max-w-2xl sm:rounded-lg"><DialogHeader className="shrink-0 pr-8"><DialogTitle>Trimite unui colaborator</DialogTitle></DialogHeader><div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
 {draft.isLoading?<p className="text-sm text-muted-foreground">Se încarcă oferta…</p>:draft.isError?<p role="alert" className="text-sm text-destructive">Oferta nu poate fi încărcată.</p>:draft.data?<>
 <p className="font-medium">{draft.data.property.title}</p>{draft.data.missingOriginals>0?<p role="alert" className="text-sm text-destructive">{draft.data.missingOriginals} fotografii nu au original fără watermark disponibil și nu apar în oferta neutră.</p>:null}{!code?<Button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const result=await create({data:{propertyId}});setCode(result.code);setLink(result.link);setMessage(result.message);}catch(e){setError(e instanceof Error?e.message:'Linkul nu poate fi generat.');}finally{setBusy(false);}}}>Generează linkul neutru</Button>:<>
 <div className="space-y-2"><Label htmlFor="offer-recipient-search">Colaborator</Label><Input id="offer-recipient-search" placeholder="Caută agentul sau agenția parteneră" value={query} disabled={disabled} onChange={e=>setQuery(e.target.value)}/>{query&&<div className="max-h-36 overflow-y-auto rounded border border-border">{draft.data.recipients.filter(c=>geographyKey([c.full_name,c.agency_name,c.phone,c.email].join(' ')).includes(geographyKey(query))).map(c=><Button type="button" variant="ghost" key={c.user_id} disabled={disabled} className="h-auto w-full justify-start whitespace-normal text-left" onClick={()=>{setSelected(c.user_id);setQuery('');setPhone(c.phone??'');setEmail(c.email??'');setMessage(collaboratorMessage(draft.data.property,link,c.full_name));}}>{c.full_name}<span className="ml-auto text-xs text-muted-foreground">{c.agency_name}</span></Button>)}</div>}{client&&<div className="flex items-center justify-between gap-2 text-sm"><span>{client.full_name}</span><Button variant="ghost" size="sm" disabled={disabled} onClick={()=>setSelected('')}>Schimbă colaboratorul</Button></div>}</div>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="offer-phone">Telefon</Label><Input id="offer-phone" type="tel" value={phone} disabled={disabled} placeholder="+40…" onChange={e=>setPhone(e.target.value)}/></div><div className="space-y-2"><Label htmlFor="offer-email">Email</Label><Input id="offer-email" type="email" value={email} disabled={disabled} placeholder="Emailul colaboratorului" onChange={e=>setEmail(e.target.value)}/></div></div>
 <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Canal">{(['whatsapp','email','sms','copy'] as const).map(c=>{const Icon=c==='whatsapp'?MessageCircle:c==='email'?Mail:c==='sms'?Smartphone:Copy;return <Button key={c} variant={channel===c?'secondary':'outline'} disabled={disabled} aria-pressed={channel===c} onClick={()=>setChannel(c)} className="px-2 text-xs"><Icon className="size-4 shrink-0"/>{OFFER_CHANNEL_LABELS[c]}</Button>;})}</div>
 <div className="space-y-2"><Label htmlFor="offer-message">Mesaj</Label><Textarea id="offer-message" rows={8} disabled={disabled} value={message} onChange={e=>setMessage(e.target.value)}/></div><a href={link} target="_blank" rel="noopener noreferrer" className="block break-all text-xs text-primary underline">{link}</a><Button variant="outline" disabled={busy} onClick={async()=>{if(!code)return;setBusy(true);try{await revoke({data:{propertyId,code}});setCode(null);setLink('');setMessage('');setDone(false);setHandoff(false);key.current=crypto.randomUUID();await qc.invalidateQueries({queryKey:['collaborator-offer-draft',propertyId]});toast.success('Codul a fost dezactivat.');}catch(e){setError(e instanceof Error?e.message:'Codul nu poate fi dezactivat.');}finally{setBusy(false);}}}>Dezactivează codul</Button>
 </>}
 </>:null}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{handoff&&!done&&<p className="text-sm text-muted-foreground">După ce trimiți mesajul, confirmă aici pentru a salva activitatea.</p>}{done&&<p role="status" className="flex items-center gap-2 text-sm text-success"><Check className="size-4"/>Activitatea a fost salvată.</p>}
 </div><div className="flex shrink-0 justify-end gap-2 border-t border-border pt-3"><Button variant="outline" disabled={busy} onClick={()=>onOpenChange(false)}>{done?'Închide':'Anulează'}</Button>{!done&&<Button disabled={busy||draft.isLoading||!draft.data||!code} onClick={()=>void action(handoff)}><Send className="size-4"/>{busy?'Se procesează…':handoff?'Am trimis mesajul':channel==='copy'?'Copiază linkul':channel==='email'?'Trimite emailul':`Deschide ${OFFER_CHANNEL_LABELS[channel]}`}</Button>}</div></DialogContent></Dialog>;
}
