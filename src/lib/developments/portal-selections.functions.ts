import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireActiveOrgAuth} from '@/lib/org-access';
import {eligibleDevelopmentPortalIds} from './portal-selections';
const input=z.object({id:z.string().uuid()});
export const getDevelopmentPortalSelections=createServerFn({method:'POST'}).middleware([requireActiveOrgAuth]).inputValidator((v:unknown)=>input.parse(v)).handler(async({data,context})=>{
 const {data:d,error}=await context.supabase.from('developments').select('id,organization_id').eq('id',data.id).single();if(error||!d)throw new Error('Ansamblu inaccesibil.');
 const {activatedPortalIds}=await import('@/lib/portals.functions');const {allPortals}=await import('@/lib/portals/registry');
 const definitions=allPortals();const eligible=eligibleDevelopmentPortalIds(await activatedPortalIds(d.organization_id),definitions);
 const {readCompleteRows}=await import('@/lib/site-feed/complete-read.server');
 const selections=await readCompleteRows((from,to)=>context.supabase.from('development_portal_selections').select('development_id,portal_key,enabled').eq('development_id',d.id).order('portal_key').range(from,to));
 const {data:job,error:jobError}=await context.supabase.from('development_portal_jobs').select('id,portal_key,enabled,status,total,processed,result,last_error').eq('development_id',d.id).order('created_at',{ascending:false}).limit(1).maybeSingle();if(jobError)throw jobError;
 return {portals:definitions.filter(p=>eligible.includes(p.id)).map(p=>({id:p.id,name:p.display_name})),selections,job};
});
export const setDevelopmentPortalSelection=createServerFn({method:'POST'}).middleware([requireActiveOrgAuth]).inputValidator((v:unknown)=>input.extend({portalKey:z.string().min(1).max(100),enabled:z.boolean()}).parse(v)).handler(async({data,context})=>{
 const {data:allowed,error:accessError}=await context.supabase.rpc('can_access_development',{_id:data.id,_edit:true});if(accessError||!allowed)throw new Error('Nu ai drepturi să editezi acest ansamblu.');
 const {data:d,error}=await context.supabase.from('developments').select('organization_id').eq('id',data.id).single();if(error||!d)throw new Error('Ansamblu inaccesibil.');
 const {activatedPortalIds}=await import('@/lib/portals.functions');const {allPortals}=await import('@/lib/portals/registry');
 const eligible=eligibleDevelopmentPortalIds(await activatedPortalIds(d.organization_id),allPortals());
 if(data.enabled&&!eligible.includes(data.portalKey))throw new Error('Portalul nu este eligibil pentru ansamblu.');
 const {error:writeError}=await context.supabase.from('development_portal_selections').upsert({development_id:data.id,portal_key:data.portalKey,enabled:data.enabled},{onConflict:'development_id,portal_key'});if(writeError)throw new Error(writeError.message);
 return {ok:true};
});