import {createHash} from 'node:crypto';
import {mapInvestment,withInvestmentParent,investmentEventStatus} from './investment';
import {olxAuthorizedRequest} from './oauth.server';
import {buildStoriaPayload} from './payload.server';
import {readStoriaAdvertError} from './advert-errors';
import type {StoriaEventShape} from './leads.server';
import type {Tables} from '@/integrations/supabase/types';
type Db=(typeof import('@/integrations/supabase/client.server'))['supabaseAdmin'];
async function request(org:string,method:'POST'|'PUT',path:string,payload?:unknown,account:'agency'|'developer'='developer'){
 const r=await olxAuthorizedRequest(org,method,path,payload,false,account);if(r.status<200||r.status>=300)throw new Error(`Storia a refuzat operațiunea (HTTP ${r.status}).`);return r.body;
}
async function investmentPayload(db:Db,d:Tables<'developments'>){
 const [{data:images},{data:org},{data:agent},{data:properties}]=await Promise.all([
 db.from('development_images').select('*').eq('development_id',d.id).order('position'),db.from('organizations').select('*').eq('id',d.organization_id).single(),db.from('profiles').select('full_name,email,phone').eq('id',d.assigned_to??'').eq('organization_id',d.organization_id).single(),db.from('properties').select('sale_price,sale_currency,currency,for_sale,status').eq('development_id',d.id).is('deleted_at',null)]);
 const {publishableImageTarget}=await import('@/lib/site-feed/property-media.server');
 const urls:string[]=[];for(const image of images??[]){const url=await publishableImageTarget(db,{...image,include_in_publish:true,is_confidential:false},{status:'active',publish_status:'published',deleted_at:null} as Tables<'properties'>,org);if(url)urls.push(url);}
 const active=(properties??[]).filter(p=>p.status==='active'&&p.for_sale&&p.sale_price&&p.sale_price>0);const currencies=new Set(active.map(p=>p.sale_currency??p.currency));const price=d.price_from??(currencies.size===1?Math.min(...active.map(p=>p.sale_price??Infinity)):null);
 return mapInvestment(d,{images:urls,contact:{name:agent?.full_name??'',email:agent?.email??'',...(agent?.phone?{phone:agent.phone}:{})},price:Number.isFinite(price)?price:null,currency:d.price_from!=null?d.currency:active[0]?.sale_currency??active[0]?.currency??null});
}
export async function prepareInvestmentUnits(db:Db,parent:Tables<'development_portal_publications'>){
 if(parent.status!=='published'||!parent.external_uuid||!parent.desired_active)return;
 const {data:properties}=await db.from('properties').select('id,for_sale,for_rent').eq('development_id',parent.development_id).is('deleted_at',null).in('status',['active','reserved','negotiation']);
 for(const p of properties??[]){const {data:selected}=await db.from('portal_publications').select('enabled').eq('property_id',p.id).eq('portal_key','storia').maybeSingle();if(!selected?.enabled)continue;
 for(const tx of ['sale','rent'] as const){if(!(tx==='sale'?p.for_sale:p.for_rent))continue;
 const {data:existing}=await db.from('storia_development_units').select('*').eq('property_id',p.id).eq('transaction_kind',tx).maybeSingle();
 if(existing&&existing.development_id!==parent.development_id&&existing.status!=='withdrawn')throw new Error('Așteaptă confirmarea retragerii din ansamblul anterior.');
 const {data:u,error}=await db.from('storia_development_units').upsert({id:existing?.id,property_id:p.id,transaction_kind:tx,development_id:parent.development_id,organization_id:parent.organization_id,connection_id:parent.connection_id,...(existing?.development_id!==parent.development_id?{external_uuid:null,status:'queued'}:{})},{onConflict:'property_id,transaction_kind'}).select('id').single();if(error)throw error;
 if(u)await db.rpc('queue_storia_development',{_id:parent.development_id,_operation:'unit',_unit:u.id});
 }}
}
export async function runDevelopmentWorker(db:Db){
 const {data:jobs,error}=await db.rpc('claim_storia_development_job');if(error)throw error;const job=jobs?.[0];if(!job)return;
 try{
 const {data:parent}=await db.from('development_portal_publications').select('*').eq('development_id',job.development_id).single();if(!parent)throw new Error('Publicare negăsită.');
 const {data:connection}=await db.from('portal_connections').select('id').eq('organization_id',job.organization_id).eq('portal','storia_developer').eq('status','connected').maybeSingle();if(!connection||connection.id!==parent.connection_id)throw new Error('Conexiunea dezvoltatorului nu mai este disponibilă.');
 if(job.operation==='publish'){
 if(!parent.desired_active)throw new Error('Publicarea a fost anulată.');
 const {data:d}=await db.from('developments').select('*').eq('id',job.development_id).single();if(!d||d.deleted_at||d.status!=='active')throw new Error('Ansamblul nu este activ.');
 if(parent.status==='sending'&&!parent.external_uuid)throw new Error('Crearea este neconfirmată; verifică notificarea Storia înainte de retrimitere.');
 if(parent.status==='pending'||parent.status==='sending'){await db.from('storia_development_jobs').update({status:'queued',updated_at:new Date().toISOString()}).eq('id',job.id);return;}
 if(parent.status==='withdrawn'&&parent.external_uuid)await request(job.organization_id,'POST',`/advert/v1/${parent.external_uuid}/activate`);
 const payload=await investmentPayload(db,d);const hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
 await db.from('development_portal_publications').update({status:'sending',last_error:null}).eq('id',parent.id);
 const body=await request(job.organization_id,parent.external_uuid?'PUT':'POST',parent.external_uuid?`/advert/v1/${parent.external_uuid}`:'/advert/v1/',payload);
 const responseData=body?.['data'] as {uuid?:string}|undefined;const uuid=parent.external_uuid??responseData?.uuid;if(!uuid)throw new Error('Storia nu a returnat UUID-ul investiției.');
 await db.from('development_portal_publications').update({external_uuid:uuid,status:'pending',payload_hash:hash,updated_at:new Date().toISOString()}).eq('id',parent.id).eq('status','sending');
 }else if(job.operation==='withdraw'){
 if(parent.external_uuid)await request(job.organization_id,'POST',`/advert/v1/${parent.external_uuid}/deactivate`);
 await db.from('development_portal_publications').update({status:'pending',desired_active:false}).eq('id',parent.id);
 }else if(job.unit_id){
 const {data:u}=await db.from('storia_development_units').select('*').eq('id',job.unit_id).single();if(!u)throw new Error('Unitate negăsită.');
 if(job.operation==='old_withdraw'){throw new Error('Operațiunea de mutare a fost eliminată: anunțul de agenție rămâne neatins.');
 }else if(job.operation==='unit_withdraw'){
 if(u.external_uuid)await request(job.organization_id,'POST',`/advert/v1/${u.external_uuid}/deactivate`);await db.from('storia_development_units').update({status:'pending'}).eq('id',u.id);
 }else{
 const {data:p}=await db.from('properties').select('development_id,deleted_at,status').eq('id',u.property_id).single();if(!p||p.development_id!==u.development_id||p.deleted_at)throw new Error('Unitatea a fost scoasă din ansamblu.');
 const {data:selection}=await db.from('portal_publications').select('enabled').eq('property_id',u.property_id).eq('portal_key','storia').maybeSingle();if(!selection?.enabled)throw new Error('Storia nu este bifat pentru unitate.');
 if(!parent.desired_active)throw new Error('Ansamblul este retras.');
 const build=await buildStoriaPayload({organizationId:job.organization_id,propertyId:u.property_id});if(!build.ok)throw new Error(build.reasons.join(' '));const listing=build.listings.find(l=>l.transaction===u.transaction_kind);if(!listing)throw new Error('Tranzacție nepublicabilă.');const payload=withInvestmentParent(listing.advert,parent);payload.custom_fields.id=`HBT-UNIT-${u.id}`;
 if(u.status==='sending'&&!u.external_uuid)throw new Error('Crearea unității este neconfirmată; așteaptă notificarea Storia.');
 if(u.status==='pending'||u.status==='sending'){await db.from('storia_development_jobs').update({status:'queued',updated_at:new Date().toISOString()}).eq('id',job.id);return;}
 if(u.status==='withdrawn'&&u.external_uuid)await request(job.organization_id,'POST',`/advert/v1/${u.external_uuid}/activate`);
 await db.from('storia_development_units').update({status:'sending'}).eq('id',u.id);
 const body=await request(job.organization_id,u.external_uuid?'PUT':'POST',u.external_uuid?`/advert/v1/${u.external_uuid}`:'/advert/v1/',payload);const data=body?.['data'] as {uuid?:string}|undefined;const uuid=u.external_uuid??data?.uuid;if(!uuid)throw new Error('Storia nu a returnat UUID-ul unității.');await db.from('storia_development_units').update({external_uuid:uuid,status:'pending',last_error:null}).eq('id',u.id).eq('status','sending');
 }}
 await db.from('storia_development_jobs').update({status:'done',updated_at:new Date().toISOString()}).eq('id',job.id);
 }catch(e){const message=e instanceof Error?e.message:'Operațiunea Storia a eșuat.';await db.from('storia_development_jobs').update({status:'error',last_error:message,updated_at:new Date().toISOString()}).eq('id',job.id);if(!job.unit_id)await db.from('development_portal_publications').update({last_error:message}).eq('development_id',job.development_id);else await db.from('storia_development_units').update({last_error:message}).eq('id',job.unit_id);}
}
export async function processDevelopmentLifecycle(db:Db,shape:StoriaEventShape):Promise<{processed:boolean;note:string}|null>{
 if(!shape.advertUuid)return null;const code=typeof shape.data['code']==='string'?shape.data['code']:typeof (shape.data['state'] as {code?:unknown}|undefined)?.code==='string'?(shape.data['state'] as {code:string}).code:null;
 const now=new Date(shape.eventTimestampMs??Date.now()).toISOString();const status=investmentEventStatus(code,shape.eventType);
 const portalError=status==='error'?readStoriaAdvertError(shape.data,shape.eventType).message:null;
 const queryParent=db.from('development_portal_publications').select('*');
 const customParent=shape.customId?.match(/^HBT-DEV-([0-9a-f-]{36})$/i)?.[1];
 const {data:parent}=await (customParent?queryParent.eq('development_id',customParent):queryParent.eq('external_uuid',shape.advertUuid)).maybeSingle();
 if(parent){if(parent.external_uuid&&parent.external_uuid!==shape.advertUuid)return null;if(parent.last_event_at&&now<parent.last_event_at)return {processed:true,note:'Eveniment vechi ignorat.'};await db.from('development_portal_publications').update({external_uuid:shape.advertUuid,status,last_event_at:now,last_error:status==='error'?(portalError??'Storia a respins investiția.'):null,...(status==='published'?{published_at:now}:{})}).eq('id',parent.id);if(status==='published')await prepareInvestmentUnits(db,{...parent,status,external_uuid:shape.advertUuid});return {processed:true,note:'Stare investiție actualizată; unitățile sunt înscrise numai după succes.'};}
 const customUnit=shape.customId?.match(/^HBT-UNIT-([0-9a-f-]{36})$/i)?.[1];const queryUnit=db.from('storia_development_units').select('*');
 const {data:u}=await (customUnit?queryUnit.eq('id',customUnit):queryUnit.eq('external_uuid',shape.advertUuid)).maybeSingle();if(!u)return null;if(u.external_uuid&&u.external_uuid!==shape.advertUuid)return null;if(u.last_event_at&&now<u.last_event_at)return {processed:true,note:'Eveniment vechi ignorat.'};
 await db.from('storia_development_units').update({external_uuid:shape.advertUuid,status,last_event_at:now,...(shape.publicUrl?.startsWith('https://')?{public_url:shape.publicUrl}:{}),last_error:status==='error'?(portalError??'Storia a respins unitatea.'):null}).eq('id',u.id);
 return {processed:true,note:'Stare unitate dezvoltator actualizată.'};
}

/** Clone side-effect only: the agency advert keeps its own normal publication; this never replaces it. */
export async function syncDevelopmentClone(db:Db,organizationId:string,propertyId:string,withdraw:boolean):Promise<'queued_withdraw'|'queued_publish'|'none'>{
 const {data:units}=await db.from('storia_development_units').select('*').eq('property_id',propertyId).eq('organization_id',organizationId);
 const relevant=(units??[]).filter(u=>u.status!=='withdrawn');
 if(withdraw){for(const u of relevant)await db.rpc('queue_storia_development',{_id:u.development_id,_operation:'unit_withdraw',_unit:u.id});return relevant.length?'queued_withdraw':'none';}
 const {data:p}=await db.from('properties').select('development_id').eq('id',propertyId).eq('organization_id',organizationId).maybeSingle();
 if(!p?.development_id)return 'none';
 const {data:parent}=await db.from('development_portal_publications').select('*').eq('development_id',p.development_id).eq('organization_id',organizationId).maybeSingle();
 if(!parent?.desired_active||parent.status!=='published'||!parent.external_uuid)return 'none';
 await prepareInvestmentUnits(db,parent);return 'queued_publish';
}
export async function queueDevelopmentClone(organizationId:string,propertyId:string,withdraw:boolean,live:boolean):Promise<void>{
 if(!live)return;
 try{const {supabaseAdmin}=await import('@/integrations/supabase/client.server');await syncDevelopmentClone(supabaseAdmin,organizationId,propertyId,withdraw);}catch(e){console.error('[storia] development clone sync failed',e instanceof Error?e.message:e);}
}

/** Storia selection for a development copy: saves the intent and drives only the developer-account unit. */
export async function applyDevelopmentCopyStoria(db:Db,input:{organizationId:string;propertyId:string;enabled:boolean;actorId:string|null;withdrawReason?:string|null}):Promise<{portalId:string;portalName:string;action:'selected'|'withdrawn';ok:boolean;message:string|null}>{
 const now=new Date().toISOString();
 const {error}=await db.from('portal_publications').upsert({organization_id:input.organizationId,property_id:input.propertyId,portal_key:'storia',enabled:input.enabled,status:input.enabled?'pending':'disabled',withdrawn_at:input.enabled?null:now,withdraw_reason:input.enabled?null:(input.withdrawReason??null),updated_by:input.actorId},{onConflict:'organization_id,property_id,portal_key'});
 if(error)return {portalId:'storia',portalName:'Storia',action:input.enabled?'selected':'withdrawn',ok:false,message:'Selecția Storia nu a putut fi salvată.'};
 try{const out=await syncDevelopmentClone(db,input.organizationId,input.propertyId,!input.enabled);
  return {portalId:'storia',portalName:'Storia',action:input.enabled?'selected':'withdrawn',ok:true,message:input.enabled?(out==='queued_publish'?'Unitatea se publică în contul de dezvoltator.':'Unitatea se publică în contul de dezvoltator după publicarea investiției.'):'Unitatea se retrage din contul de dezvoltator.'};
 }catch(e){return {portalId:'storia',portalName:'Storia',action:input.enabled?'selected':'withdrawn',ok:false,message:e instanceof Error?e.message:'Unitatea nu a putut fi actualizată.'};}
}
/** True when the property is a development copy: no agency-account Storia advert may be created or updated. */
export async function isDevelopmentCopy(organizationId:string,propertyId:string):Promise<boolean>{
 const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
 const {data}=await supabaseAdmin.from('properties').select('development_id').eq('id',propertyId).eq('organization_id',organizationId).maybeSingle();
 return Boolean(data?.development_id);
}
