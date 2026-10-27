import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireActiveOrgAuth } from "./org-access";
import { offerSendReason, offerMessage, offerPhone, offerChannelUrl, type OfferChannel } from "./offer-client";
import { offerShareUrl } from "./share";
import { isEmail } from "./mailgun";

type Context={supabase:SupabaseClient<Database>;userId:string};
const inputSchema=z.object({propertyId:z.string().uuid(),contactId:z.string().uuid().nullable().optional(),leadId:z.string().uuid().nullable().optional(),channel:z.enum(['whatsapp','email','sms','copy']),recipient:z.string().trim().max(320),message:z.string().trim().min(1).max(10000),sendKey:z.string().uuid(),confirmed:z.boolean().optional()});
type Input=z.infer<typeof inputSchema>;
export type OfferRecipient={key:string;name:string;phone:string|null;email:string|null;contactId:string|null;leadId:string|null};
async function loadActorProperty(context:Context,propertyId:string){
 const {data:p,error}=await context.supabase.from('properties').select('id,organization_id,status,publish_status,deleted_at,title,price,currency,transaction_kind,city,district').eq('id',propertyId).is('deleted_at',null).maybeSingle();
 if(error || !p) throw new Error('Proprietatea nu este disponibilă.');
 const {data:actor}=await context.supabase.from('profiles').select('id,organization_id,full_name,email').eq('id',context.userId).maybeSingle();
 if(!actor || actor.organization_id!==p.organization_id) throw new Error('Poți trimite numai ofertele agenției tale.');
 const {data:org}=await context.supabase.from('organizations').select('name').eq('id',p.organization_id).maybeSingle();
 return {p,actor,agencyName:org?.name ?? 'Agenția ta'};
}
async function prepare(context:Context,data:Input){
 const loaded=await loadActorProperty(context,data.propertyId);
 const reason=offerSendReason(loaded.p);if(reason) throw new Error(reason);
 let contactId=data.contactId??null,leadId=data.leadId??null;
 if(leadId){
  const {data:l,error}=await context.supabase.from('leads').select('id,organization_id,contact_id').eq('id',leadId).is('deleted_at',null).maybeSingle();
  if(error||!l||l.organization_id!==loaded.p.organization_id) throw new Error('Clientul nu este disponibil.');
  if(contactId&&contactId!==l.contact_id) throw new Error('Clientul și lead-ul nu corespund.');
  contactId=l.contact_id;
 }
 if(contactId){
  const {data:c,error}=await context.supabase.from('contacts').select('id,organization_id').eq('id',contactId).maybeSingle();
  if(error||!c||c.organization_id!==loaded.p.organization_id) throw new Error('Contactul nu este disponibil.');
 }
 const recipient=data.channel==='email'?data.recipient.toLowerCase():data.channel==='copy'?'':offerPhone(data.recipient);
 if(data.channel==='email'&&!isEmail(recipient)) throw new Error('Introdu un email valid.');
 if((data.channel==='whatsapp'||data.channel==='sms')&&!recipient) throw new Error('Introdu un telefon valid, cu prefix de țară.');
 const link=offerShareUrl(loaded.p.id);
 if(!data.message.includes(link)) throw new Error('Mesajul trebuie să conțină linkul ofertei.');
 const signature=[loaded.actor.full_name??'Agent',loaded.agencyName].join('\n');
 const message=data.message.includes(signature)?data.message:`${data.message}\n\n${signature}`;
 return {...loaded,recipient,message,contactId,leadId,link,url:offerChannelUrl(data.channel,recipient,message)};
}
export const getOfferClientDraft=createServerFn({method:'GET'}).middleware([requireActiveOrgAuth]).inputValidator((v:unknown)=>z.object({propertyId:z.string().uuid()}).parse(v)).handler(async({data,context})=>{
 const loaded=await loadActorProperty(context,data.propertyId);
 const recipients:OfferRecipient[]=[];
 for(let offset=0;;offset+=1000){const {data:rows,error}=await context.supabase.from('contacts').select('id,first_name,last_name,phone,whatsapp,email').eq('organization_id',loaded.p.organization_id).order('id').range(offset,offset+999);if(error) throw new Error('Contactele nu pot fi încărcate.');for(const c of rows??[])recipients.push({key:`contact:${c.id}`,name:[c.first_name,c.last_name].filter(Boolean).join(' '),phone:c.whatsapp||c.phone,email:c.email,contactId:c.id,leadId:null});if((rows?.length??0)<1000)break;}
 for(let offset=0;;offset+=1000){const {data:rows,error}=await context.supabase.from('leads').select('id,name,phone,email,contact_id').eq('organization_id',loaded.p.organization_id).is('deleted_at',null).order('id').range(offset,offset+999);if(error)throw new Error('Lead-urile nu pot fi încărcate.');for(const l of rows??[])recipients.push({key:`lead:${l.id}`,name:l.name,phone:l.phone,email:l.email,contactId:l.contact_id,leadId:l.id});if((rows?.length??0)<1000)break;}
 return {property:loaded.p,agentName:loaded.actor.full_name??'Agent',agencyName:loaded.agencyName,recipients,reason:offerSendReason(loaded.p),message:offerMessage(loaded.p,loaded.actor.full_name??'Agent',loaded.agencyName),link:offerShareUrl(loaded.p.id)};
});
export const previewOfferClientSend=createServerFn({method:'POST'}).middleware([requireActiveOrgAuth]).inputValidator((v:unknown)=>inputSchema.parse(v)).handler(async({data,context})=>{const p=await prepare(context,data);return {message:p.message,link:p.link,url:p.url,recipient:p.recipient,channel:data.channel};});
export const sendOfferClient=createServerFn({method:'POST'}).middleware([requireActiveOrgAuth]).inputValidator((v:unknown)=>inputSchema.parse(v)).handler(async({data,context})=>{
 const p=await prepare(context,data);
 if((data.channel==='whatsapp'||data.channel==='sms')&&!data.confirmed)throw new Error('Confirmă că ai trimis mesajul.');
 const db=context.supabase;
 const {data:existing}=await db.from('offer_client_deliveries').select('id,status,activity_id,property_id,channel,recipient').eq('id',data.sendKey).maybeSingle();
 if(existing&&(existing.property_id!==data.propertyId||existing.channel!==data.channel||existing.recipient!==p.recipient))throw new Error('Această trimitere nu corespunde mesajului.');
 if(existing?.activity_id)return {activityId:existing.activity_id};
 if(existing?.status==='pending')throw new Error('Trimiterea este în curs. Nu retrimite mesajul.');
 if(!existing){const {error}=await db.from('offer_client_deliveries').insert({id:data.sendKey,organization_id:p.p.organization_id,agent_id:context.userId,property_id:data.propertyId,contact_id:p.contactId,lead_id:p.leadId,channel:data.channel,recipient:p.recipient,status:'pending'});if(error)throw new Error('Trimiterea nu poate fi pornită.');}
 if(existing?.status==='failed'){const {data:claim,error}=await db.from('offer_client_deliveries').update({status:'pending'}).eq('id',data.sendKey).eq('status','failed').select('id').maybeSingle();if(error||!claim)throw new Error('Trimiterea este deja în curs.');}
 if(data.channel==='email'&&existing?.status!=='sent'){
  const {sendEmail,getMailgunConfig}=await import('./mailgun.server');
  const cfg=getMailgunConfig();
  const senderName=(p.actor.full_name??'Agent').replace(/[<>"\r\n]/g,' ').trim();
  const outcome=cfg?await sendEmail({from:`${senderName} <${cfg.defaultFrom}>`,to:[p.recipient],replyTo:p.actor.email&&isEmail(p.actor.email)?p.actor.email:undefined,subject:`Ofertă: ${p.p.title}`,text:p.message,sendKey:data.sendKey}):{ok:false,error:'Serviciul de email nu este configurat.'};
  if(!outcome.ok){await db.from('offer_client_deliveries').update({status:'failed'}).eq('id',data.sendKey);throw new Error('Emailul nu a fost trimis. Încearcă din nou.');}
 }
 if(existing?.status!=='sent'){const {error}=await db.from('offer_client_deliveries').update({status:'sent',sent_at:new Date().toISOString()}).eq('id',data.sendKey);if(error)throw new Error('Trimiterea a fost procesată, dar confirmarea nu s-a salvat. Nu retrimite mesajul.');}
 const {data:activityId,error}=await db.rpc('finish_offer_client_delivery',{_id:data.sendKey});
 if(error)throw new Error('Trimiterea este confirmată, dar activitatea nu s-a salvat. Reîncearcă înregistrarea fără retrimitere.');
 return {activityId};
});
