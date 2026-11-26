import {eligibleDevelopmentPortalIds} from './portal-selections';
import {summarizeDevelopmentPortal,summarizeStoriaDevelopment,type DevelopmentPortalStatus} from './portal-status';

type Db=(typeof import('@/integrations/supabase/client.server'))['supabaseAdmin'];

/** Caller-RLS entry read, then the shared portal rule scoped strictly to these unit IDs. */
export async function readDevelopmentPortalStates(db:Db,id:string){
 const {data:d,error}=await db.from('developments').select('id,organization_id').eq('id',id).single();if(error||!d)throw new Error('Ansamblu inaccesibil.');
 const {activatedPortalIds,computeOrgPortalStates}=await import('@/lib/portals.functions');const {allPortals}=await import('@/lib/portals/registry');
 const definitions=allPortals();const eligible=eligibleDevelopmentPortalIds(await activatedPortalIds(d.organization_id),definitions);
 const {readCompleteRows}=await import('@/lib/site-feed/complete-read.server');
 const units=await readCompleteRows((from,to)=>db.from('properties').select('id').eq('organization_id',d.organization_id).eq('development_id',d.id).is('deleted_at',null).order('id').range(from,to));
 const unitIds=units.map(unit=>unit.id);const genericPortals=new Set(eligible.filter(portal=>portal!=='storia'));
 const [states,storiaRows,parentResult]=await Promise.all([
  genericPortals.size&&unitIds.length?computeOrgPortalStates(d.organization_id,{propertyIds:unitIds,portalIds:genericPortals}):Promise.resolve(new Map()),
  readCompleteRows((from,to)=>db.from('storia_development_units').select('id,property_id,status').eq('organization_id',d.organization_id).eq('development_id',d.id).order('id').range(from,to)),
  db.from('development_portal_publications').select('status').eq('development_id',d.id).eq('portal','storia').maybeSingle(),
 ]);
 if(parentResult.error)throw parentResult.error;
 const summaries:DevelopmentPortalStatus[]=eligible.map(portalId=>portalId==='storia'
  ?summarizeStoriaDevelopment({unitIds,rows:storiaRows,developmentStatus:parentResult.data?.status??null})
  :summarizeDevelopmentPortal({portalId,unitIds,states}));
 const uncovered=summaries.filter(summary=>!summary.covered).map(summary=>summary.portalId);
 if(uncovered.length&&unitIds.length){
  const selectedRows=await readCompleteRows((from,to)=>db.from('portal_publications').select('property_id,portal_key,enabled').eq('organization_id',d.organization_id).eq('enabled',true).in('property_id',unitIds).in('portal_key',uncovered).order('property_id').order('portal_key').range(from,to));
  const selected=new Map<string,Set<string>>();for(const row of selectedRows){const set=selected.get(row.portal_key)??new Set<string>();set.add(row.property_id);selected.set(row.portal_key,set);}
  for(const summary of summaries)if(!summary.covered)summary.selected=selected.get(summary.portalId)?.size??0;
 }
 return {portals:summaries};
}
