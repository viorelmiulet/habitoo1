import type {UnitOperationDb,UnitOperationItem} from './unit-operations';
import type {DevelopmentPortalChange} from './portal-selections';
export type DevelopmentPortalJob={id:string;organization_id:string;development_id:string;portal_key:string;enabled:boolean;requested_by:string;attempts:number;total:number;changes?:DevelopmentPortalChange[]|null};
export type DevelopmentPortalItem=UnitOperationItem&{skip:boolean;changes?:DevelopmentPortalChange[]};
export type DevelopmentPortalJobDb=Omit<UnitOperationDb,'step'>&{step:(id:string)=>Promise<DevelopmentPortalItem|null>};
type PortalResult={portalId?:string;ok:boolean;message:string|null};
export function developmentPortalJobChanges(job:DevelopmentPortalJob):DevelopmentPortalChange[]{
 return job.changes??[{portal_key:job.portal_key,enabled:job.enabled}];
}
/** One unit step, at most two calls: enabling and withdrawal require different privilege flags. */
export async function applyDevelopmentPortalChanges(job:DevelopmentPortalJob,item:DevelopmentPortalItem,apply:(input:{organizationId:string;actorId:string;superadmin:boolean;data:{propertyId:string;syncExisting:false;selections:{portalId:string;enabled:boolean}[]}})=>Promise<{results:PortalResult[]}>):Promise<PortalResult[]>{
 const changes=item.changes??developmentPortalJobChanges(job);
 const out:PortalResult[]=[];
 for(const enabled of [true,false]){
  const selections=changes.filter(c=>c.enabled===enabled).map(c=>({portalId:c.portal_key,enabled}));
  if(!selections.length)continue;
  try{
   const {results}=await apply({organizationId:job.organization_id,actorId:job.requested_by,superadmin:!enabled,data:{propertyId:item.propertyId,syncExisting:false,selections}});
   for(const s of selections){
    const result=results.find(r=>r.portalId===s.portalId);
    out.push(result??{portalId:s.portalId,ok:false,message:'Operație neconfirmată.'});
   }
  }catch(e){
   for(const s of selections)out.push({portalId:s.portalId,ok:false,message:e instanceof Error?e.message:'Portalul nu a putut fi actualizat.'});
  }
 }
 return out;
}
export async function runDevelopmentPortalJob(job:DevelopmentPortalJob,db:DevelopmentPortalJobDb,apply:(job:DevelopmentPortalJob,item:DevelopmentPortalItem)=>Promise<PortalResult[]>) {
 if(job.attempts>3){await db.finish(job.id,'Operația s-a întrerupt de mai multe ori fără progres.');return {processed:0};}
 try {
  const item=await db.step(job.id);if(!item){await db.finish(job.id,null);return {processed:0};}
  let reason:string|null=null;
  if(!item.skip)try{const results=await apply(job,item);reason=results.length?results.filter(r=>!r.ok).map(r=>`${r.portalId??job.portal_key}: ${r.message??'Portal neconfirmat.'}`).join('; ')||null:'Operație neconfirmată.';}catch(e){reason=`${(item.changes??developmentPortalJobChanges(job)).map(c=>c.portal_key).join(', ')}: ${e instanceof Error?e.message:'Portalul nu a putut fi actualizat.'}`;}
  await db.advance(job.id,item.index,reason);
  if(item.index+1>=job.total)await db.finish(job.id,null);else await db.release(job.id);
  return {processed:1};
 }catch(e){await db.finish(job.id,e instanceof Error?e.message:'Operația nu a putut continua.');return {processed:0};}
}