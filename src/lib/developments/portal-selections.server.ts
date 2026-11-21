import {readCompleteRows} from '@/lib/site-feed/complete-read.server';
import {eligibleDevelopmentPortalIds,selectedDevelopmentPortalIds} from './portal-selections';
type Db=(typeof import('@/integrations/supabase/client.server'))['supabaseAdmin'];

export async function readDevelopmentPortals(db:Db,developmentId:string,organizationId:string) {
 const {activatedPortalIds}=await import('@/lib/portals.functions');
 const {allPortals}=await import('@/lib/portals/registry');
 const selections=await readCompleteRows((from,to)=>db.from('development_portal_selections').select('development_id,portal_key,enabled').eq('development_id',developmentId).order('portal_key').range(from,to));
 const eligible=eligibleDevelopmentPortalIds(await activatedPortalIds(organizationId),allPortals());
 // Preserve the separate agency-site opt-in when inherited from existing units.
 if(selections.some(s=>s.portal_key==='agency_site'&&s.enabled)){
  const {data:site,error}=await db.from('agency_site_portals').select('active').eq('organization_id',organizationId).maybeSingle();if(error)throw error;if(site?.active)eligible.push('agency_site');
 }
 return selectedDevelopmentPortalIds(selections,developmentId,eligible);
}
/** Complete, fail-closed parent choice read. The site remains a separate selection. */
export async function selectedDevelopmentIds(db:Db,portal:string,ids?:string[]) {
 if(ids?.length===0)return [];
 const chunks=ids?Array.from({length:Math.ceil(ids.length/300)},(_,i)=>ids.slice(i*300,(i+1)*300)):[null];
 const out:string[]=[];
 for(const chunk of chunks) {
  const rows=await readCompleteRows((from,to)=>{let q=db.from('development_portal_selections').select('development_id').eq('portal_key',portal).eq('enabled',true).order('development_id');if(chunk)q=q.in('development_id',chunk);return q.range(from,to);});
  out.push(...rows.map(r=>r.development_id));
 }
 return out;
}