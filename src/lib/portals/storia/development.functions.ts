import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireActiveOrgAuth} from '@/lib/org-access';
export const getDevelopmentPublishing=createServerFn({method:'POST'}).middleware([requireActiveOrgAuth]).inputValidator((v:unknown)=>z.object({id:z.string().uuid()}).parse(v)).handler(async({data,context})=>{
 const {data:d,error}=await context.supabase.from('developments').select('id,organization_id').eq('id',data.id).single();if(error||!d)throw new Error('Ansamblu inaccesibil.');
 const {loadStoriaTokens}=await import('./oauth.server');
 const connected=Boolean(await loadStoriaTokens(d.organization_id,'developer'));
 const {data:publication}=await context.supabase.from('development_portal_publications').select('*').eq('development_id',d.id).maybeSingle();
 const {data:units}=await context.supabase.from('storia_development_units').select('*').eq('development_id',d.id);
 return {connected,publication,units:units??[]};
});
export const requestDevelopmentPublishing=createServerFn({method:'POST'}).middleware([requireActiveOrgAuth]).inputValidator((v:unknown)=>z.object({id:z.string().uuid(),withdraw:z.boolean().default(false)}).parse(v)).handler(async({data,context})=>{
 const {error}=await context.supabase.rpc('request_storia_development',{_id:data.id,_withdraw:data.withdraw});if(error)throw new Error(error.message);return {ok:true};
});
