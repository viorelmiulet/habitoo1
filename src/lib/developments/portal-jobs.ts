import type {UnitOperationDb,UnitOperationItem} from './unit-operations';
export type DevelopmentPortalJob={id:string;organization_id:string;development_id:string;portal_key:string;enabled:boolean;requested_by:string;attempts:number;total:number};
export type DevelopmentPortalItem=UnitOperationItem&{skip:boolean};
export type DevelopmentPortalJobDb=Omit<UnitOperationDb,'step'>&{step:(id:string)=>Promise<DevelopmentPortalItem|null>};
export async function runDevelopmentPortalJob(job:DevelopmentPortalJob,db:DevelopmentPortalJobDb,apply:(job:DevelopmentPortalJob,item:DevelopmentPortalItem)=>Promise<{ok:boolean;message:string|null}[]>) {
 if(job.attempts>3){await db.finish(job.id,'Operația s-a întrerupt de mai multe ori fără progres.');return {processed:0};}
 try {
  const item=await db.step(job.id);if(!item){await db.finish(job.id,null);return {processed:0};}
  let reason:string|null=null;
  if(!item.skip)try{const results=await apply(job,item);reason=results.length?results.filter(r=>!r.ok).map(r=>r.message??'Portal neconfirmat.').join('; ')||null:'Operație neconfirmată.';}catch(e){reason=e instanceof Error?e.message:'Portalul nu a putut fi actualizat.';}
  await db.advance(job.id,item.index,reason);
  if(item.index+1>=job.total)await db.finish(job.id,null);else await db.release(job.id);
  return {processed:1};
 }catch(e){await db.finish(job.id,e instanceof Error?e.message:'Operația nu a putut continua.');return {processed:0};}
}