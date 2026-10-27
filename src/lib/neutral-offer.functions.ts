import { createServerFn } from '@tanstack/react-start';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '@/integrations/supabase/types';
import { requireActiveOrgAuth } from './org-access';
import { neutralOfferReason, neutralOfferUrl, collaboratorMessage, type NeutralOffer } from './neutral-offer';
import { offerPhone, offerChannelUrl } from './offer-client';
import { isEmail } from './mailgun';
import { publicRead } from './public-read';
type Context={supabase:SupabaseClient<Database>;userId:string};
const propertyInput=z.object({propertyId:z.string().uuid()});
const codeSchema=z.string().regex(/^[a-f0-9]{48}$/);
const sendInput=propertyInput.extend({code:codeSchema,recipientAgentId:z.string().uuid().nullable().optional(),recipientName:z.string().trim().max(200),channel:z.enum(['whatsapp','email','sms','copy']),recipient:z.string().trim().max(320),message:z.string().trim().min(1).max(10000),sendKey:z.string().uuid(),confirmed:z.boolean().optional()});
async function actorProperty(ctx:Context,id:string){
 const {data:p,error}=await ctx.supabase.from('properties').select('id,organization_id,title,status,deleted_at,price,currency,city,district,collab_commission_percent').eq('id',id).is('deleted_at',null).maybeSingle();
 const {data:actor}=await ctx.supabase.from('profiles').select('organization_id,full_name,email').eq('id',ctx.userId).maybeSingle();
 if(error||!p||!actor||actor.organization_id!==p.organization_id)throw new Error('Proprietatea nu este disponibilă.');
 const reason=neutralOfferReason(p);if(reason)throw new Error(reason);return {p,actor};
}
export const getCollaboratorOfferDraft=createServerFn({method:'GET'}).middleware([requireActiveOrgAuth]).inputValidator((v:unknown)=>propertyInput.parse(v)).handler(async({data,context})=>{
 const {p}=await actorProperty(context,data.propertyId);
 const {data:links,error}=await context.supabase.from('neutral_offer_links').select('code').eq('property_id',p.id).is('revoked_at',null).order('created_at',{ascending:false}).limit(1);if(error)throw new Error('Linkul nu poate fi încărcat.');
 const {data:recipients,error:directoryError}=await context.supabase.rpc('collaborator_offer_recipients');if(directoryError)throw new Error('Colaboratorii nu pot fi încărcați.');
 const {data:images,error:imageError}=await context.supabase.from('property_images').select('storage_path').eq('property_id',p.id).eq('include_in_publish',true).eq('is_confidential',false);if(imageError)throw new Error('Fotografiile nu pot fi verificate.');
 const code=links?.[0]?.code??null;return {property:p,recipients:recipients??[],code,link:code?neutralOfferUrl(code):null,missingOriginals:(images??[]).filter(i=>!i.storage_path||i.storage_path.includes('watermark')).length};
});
export const createCollaboratorOfferLink=createServerFn({method:'POST'}).middleware([requireActiveOrgAuth]).inputValidator((v:unknown)=>propertyInput.parse(v)).handler(async({data,context})=>{
 const {p}=await actorProperty(context,data.propertyId);const bytes=crypto.getRandomValues(new Uint8Array(24));const code=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 const {error}=await context.supabase.from('neutral_offer_links').insert({code,property_id:p.id,organization_id:p.organization_id,created_by:context.userId});if(error)throw new Error('Linkul nu a putut fi generat.');return {code,link:neutralOfferUrl(code),message:collaboratorMessage(p,neutralOfferUrl(code))};
});
export const revokeCollaboratorOfferLink=createServerFn({method:'POST'}).middleware([requireActiveOrgAuth]).inputValidator((v:unknown)=>propertyInput.extend({code:codeSchema}).parse(v)).handler(async({data,context})=>{
 // Caller RLS also permits withdrawal after a status change.
 const {data:row,error}=await context.supabase.from('neutral_offer_links').update({revoked_at:new Date().toISOString()}).eq('property_id',data.propertyId).eq('code',data.code).is('revoked_at',null).select('id').maybeSingle();if(error||!row)throw new Error('Codul nu poate fi dezactivat.');return {ok:true};
});
async function prepare(ctx:Context,data:z.infer<typeof sendInput>){
 const loaded=await actorProperty(ctx,data.propertyId);
 const {data:link,error}=await ctx.supabase.from('neutral_offer_links').select('id,code').eq('code',data.code).eq('property_id',data.propertyId).is('revoked_at',null).maybeSingle();if(error||!link)throw new Error('Oferta nu mai este disponibilă.');
 let recipientName=data.recipientName||'Destinatar manual';
 const recipient=data.channel==='copy'?'':data.channel==='email'?data.recipient.toLowerCase():offerPhone(data.recipient);
 if(data.channel==='email'&&!isEmail(recipient))throw new Error('Introdu un email valid.');
 if((data.channel==='sms'||data.channel==='whatsapp')&&!recipient)throw new Error('Introdu un telefon valid.');
 if(data.recipientAgentId){const {data:recipients,error}=await ctx.supabase.rpc('collaborator_offer_recipients');const r=recipients?.find(r=>r.user_id===data.recipientAgentId);if(error||!r)throw new Error('Colaboratorul nu mai este disponibil.');recipientName=`${r.full_name} — ${r.agency_name}`;if(data.channel==='email'&&recipient!==r.email?.toLowerCase()||['whatsapp','sms'].includes(data.channel)&&recipient!==offerPhone(r.phone??''))throw new Error('Destinatarul nu corespunde colaboratorului ales.');}
 const url=neutralOfferUrl(link.code);if(!data.message.includes(url))throw new Error('Mesajul trebuie să conțină linkul neutru.');return {...loaded,link,recipient,recipientName,url:offerChannelUrl(data.channel,recipient,data.message)};
}
export const previewCollaboratorOfferSend=createServerFn({method:'POST'}).middleware([requireActiveOrgAuth]).inputValidator((v:unknown)=>sendInput.parse(v)).handler(async({data,context})=>{const p=await prepare(context,data);return {link:neutralOfferUrl(data.code),url:p.url,message:data.message};});
export const sendCollaboratorOffer=createServerFn({method:'POST'}).middleware([requireActiveOrgAuth]).inputValidator((v:unknown)=>sendInput.parse(v)).handler(async({data,context})=>{
 const p=await prepare(context,data);if(['whatsapp','sms'].includes(data.channel)&&!data.confirmed)throw new Error('Confirmă că ai trimis mesajul.');
 const db=context.supabase;const {data:existing,error:readError}=await db.from('collaborator_offer_deliveries').select('*').eq('id',data.sendKey).maybeSingle();if(readError)throw new Error('Trimiterea nu poate fi verificată.');
 if(existing&&(existing.property_id!==data.propertyId||existing.link_id!==p.link.id||existing.channel!==data.channel||existing.recipient!==p.recipient||existing.recipient_agent_id!==(data.recipientAgentId??null)))throw new Error('Cheia aparține altei trimiteri.');
 if(existing?.activity_id)return {activityId:existing.activity_id};if(existing?.status==='pending')throw new Error('Trimiterea este în curs. Nu retrimite.');
 if(!existing){const {error}=await db.from('collaborator_offer_deliveries').insert({id:data.sendKey,organization_id:p.p.organization_id,agent_id:context.userId,property_id:data.propertyId,link_id:p.link.id,recipient_agent_id:data.recipientAgentId??null,recipient:p.recipient,recipient_name:p.recipientName,channel:data.channel});if(error)throw new Error('Trimiterea nu poate fi pornită.');}
 if(existing?.status==='failed'){const {data:claim,error}=await db.from('collaborator_offer_deliveries').update({status:'pending'}).eq('id',data.sendKey).eq('status','failed').select('id').maybeSingle();if(error||!claim)throw new Error('Trimiterea este deja în curs.');}
 if(data.channel==='email'&&existing?.status!=='sent'){
 const {sendEmail,getMailgunConfig}=await import('./mailgun.server');const cfg=getMailgunConfig();const sender=(p.actor.full_name??'Agent').replace(/[<>"\r\n]/g,' ');
 const outcome=cfg?await sendEmail({from:`${sender} <${cfg.defaultFrom}>`,to:[p.recipient],replyTo:p.actor.email&&isEmail(p.actor.email)?p.actor.email:undefined,subject:`Ofertă pentru colaborare: ${p.p.title}`,text:data.message,sendKey:data.sendKey}):{ok:false};
 if(!outcome.ok){await db.from('collaborator_offer_deliveries').update({status:'failed'}).eq('id',data.sendKey);throw new Error('Emailul nu a fost trimis.');}}
 if(existing?.status!=='sent'){const {error}=await db.from('collaborator_offer_deliveries').update({status:'sent',sent_at:new Date().toISOString()}).eq('id',data.sendKey);if(error)throw new Error('Confirmarea nu s-a salvat. Nu retrimite mesajul.');}
 const {data:activityId,error}=await db.rpc('finish_collaborator_offer_delivery',{_id:data.sendKey});if(error)throw new Error('Reîncearcă înregistrarea activității, fără retrimitere.');return {activityId};
});
export const getNeutralOffer=createServerFn({method:'GET'}).inputValidator((v:unknown)=>z.object({code:z.string().max(100)}).parse(v)).handler(async({data}):Promise<NeutralOffer|null>=>{
 if(!codeSchema.safeParse(data.code).success)return null;
 const key=process.env['SUPABASE_PUBLISHABLE_KEY'];const url=process.env['SUPABASE_URL'];if(!key||!url)return null;
 const db=createClient<Database>(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>{const headers=new Headers(init?.headers);if(key.startsWith('sb_')&&headers.get('Authorization')===`Bearer ${key}`)headers.delete('Authorization');headers.set('apikey',key);return fetch(input,{...init,headers});}}});
 return publicRead('neutral offer',async()=>{const {data:offer,error}=await db.rpc('public_neutral_offer',{_code:data.code});if(error)throw error;return offer as NeutralOffer|null;},null);
});