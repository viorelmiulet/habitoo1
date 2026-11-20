import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireActiveOrgAuth} from '@/lib/org-access';
export const getDevelopmentPublishing=createServerFn({method:'POST'}).middleware([requireActiveOrgAuth]).inputValidator((v:unknown)=>z.object({id:z.string().uuid()}).parse(v)).handler(async({data,context})=>{
 const {data:d,error}=await context.supabase.from('developments').select('id,organization_id').eq('id',data.id).single();if(error||!d)throw new Error('Ansamblu inaccesibil.');
 const {loadStoriaTokens}=await import('./oauth.server');
 const connected=Boolean(await loadStoriaTokens(d.organization_id,'developer'));
 const {data:publication}=await context.supabase.from('development_portal_publications').select('*').eq('development_id',d.id).maybeSingle();
 const {data:units}=await context.supabase.from('storia_development_units').select('*').eq('development_id',d.id);
 const {data:properties}=await context.supabase.from('properties').select('id,title').eq('development_id',d.id).is('deleted_at',null);
 const ids=(properties??[]).map(p=>p.id);const {data:listings}=ids.length?await context.supabase.from('portal_listings').select('property_id,external_id,status').eq('portal','storia').in('property_id',ids):{data:[]};
 const moves=(properties??[]).filter(p=>(listings??[]).some(l=>l.property_id===p.id&&l.external_id)&&!(units??[]).some(u=>u.property_id===p.id&&u.external_uuid));
 return {connected,publication,units:units??[],moves};
});
export const requestDevelopmentPublishing=createServerFn({method:'POST'}).middleware([requireActiveOrgAuth]).inputValidator((v:unknown)=>z.object({id:z.string().uuid(),withdraw:z.boolean().default(false),confirmed:z.array(z.string().uuid()).default([])}).parse(v)).handler(async({data,context})=>{
 const {error}=await context.supabase.rpc('request_storia_development',{_id:data.id,_withdraw:data.withdraw,_confirmed:data.confirmed});if(error)throw new Error(error.message);return {ok:true};
});
