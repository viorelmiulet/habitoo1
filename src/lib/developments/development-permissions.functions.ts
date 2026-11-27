import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireActiveOrgAuth} from '@/lib/org-access';
import {eligibleDevelopmentPortalIds} from './portal-selections';
async function orgOf(supabase:{from:(t:'profiles')=>any},userId:string){
 const {data,error}=await supabase.from('profiles').select('organization_id').eq('id',userId).single();if(error||!data?.organization_id)throw new Error('Agenție inaccesibilă.');return data.organization_id as string;
}
async function eligiblePortals(organizationId:string){
 const {activatedPortalIds}=await import('@/lib/portals.functions');const {allPortals}=await import('@/lib/portals/registry');
 const definitions=allPortals();const eligible=eligibleDevelopmentPortalIds(await activatedPortalIds(organizationId),definitions);
 return definitions.filter(p=>eligible.includes(p.id)).map(p=>({id:p.id,name:p.id==='storia'?'Storia — Cont dezvoltator':p.display_name}));
}
/** The signed-in user's own development rights (for hiding the create action). */
export const getMyDevelopmentPermissions=createServerFn({method:'POST'}).middleware([requireActiveOrgAuth]).handler(async({context})=>{
 const {readActorDevelopmentPermissions}=await import('./development-permissions.server');
 const org=await orgOf(context.supabase,context.userId);
 return readActorDevelopmentPermissions(context.supabase,context.userId,org);
});
const target=z.object({userId:z.string().uuid()});
export const getAgentDevelopmentPermissions=createServerFn({method:'POST'}).middleware([requireActiveOrgAuth]).inputValidator((v:unknown)=>target.parse(v)).handler(async({data,context})=>{
 const org=await orgOf(context.supabase,data.userId);
 const {data:row,error}=await context.supabase.from('agent_development_permissions').select('can_create,allowed_portals,updated_at').eq('organization_id',org).eq('user_id',data.userId).maybeSingle();if(error)throw new Error(error.message);
 return {portals:await eligiblePortals(org),canCreate:row?.can_create===true,allowedPortals:row?.allowed_portals??[],updatedAt:row?.updated_at??null};
});
export const saveAgentDevelopmentPermissions=createServerFn({method:'POST'}).middleware([requireActiveOrgAuth]).inputValidator((v:unknown)=>target.extend({canCreate:z.boolean(),allowedPortals:z.array(z.string().min(1).max(100)).max(100)}).parse(v)).handler(async({data,context})=>{
 const org=await orgOf(context.supabase,data.userId);
 // Caller RLS: only the agency admin or a superadmin can write; the DB trigger audits the change.
 const {error}=await context.supabase.from('agent_development_permissions').upsert({organization_id:org,user_id:data.userId,can_create:data.canCreate,allowed_portals:[...new Set(data.allowedPortals)]},{onConflict:'organization_id,user_id'});
 if(error)throw new Error(error.code==='42501'?'Doar administratorul agenției poate modifica drepturile.':error.message);
 return {ok:true as const};
});
