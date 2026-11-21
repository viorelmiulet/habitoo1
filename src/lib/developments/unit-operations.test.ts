import {it,expect,vi} from 'vitest';
import {runUnitOperationOnce,type UnitOperationDb,type UnitOperationJob,type UnitOperationItem} from './unit-operations';
import {allPortals} from '@/lib/portals/registry';

const job:UnitOperationJob={id:'job',organization_id:'org',requested_by:'agent',operation:'withdraw',attempts:1,total:3};
function fixture(){
 const state={index:0,pending:null as UnitOperationItem|null,mutations:0};
 const db:UnitOperationDb={
  step:vi.fn(async()=>{if(state.pending)return state.pending;if(state.index>=3)return null;state.mutations++;return state.pending={index:state.index,propertyId:`copy-${state.index}`,portals:['storia','agency_site','imove']};}),
  advance:vi.fn(async(_id,i)=>{if(state.pending?.index===i){state.index++;state.pending=null;}}),release:vi.fn(async()=>{}),finish:vi.fn(async()=>{}),
 };
 const deps={activatedPortals:vi.fn(async()=>new Set(['storia','imove'])),definitions:allPortals,
  applySelection:vi.fn(async(_j:UnitOperationJob,_item:UnitOperationItem,s:{portalId:string;enabled:boolean}[]):Promise<{portalId:string;ok:boolean;message:string|null}[]>=>s.map(p=>({portalId:p.portalId,ok:true,message:null}))),enqueueDeletion:vi.fn(async()=>{}),
 };
 return {db,deps,state};
}
it('procesează câte o unitate, reia următoarea și finalizează numai după toate',async()=>{
 const {db,deps,state}=fixture();
 expect(await runUnitOperationOnce(job,db,deps)).toEqual({jobId:'job',processed:1,finished:false});
 expect(deps.applySelection).toHaveBeenCalledWith(job,{index:0,propertyId:'copy-0',portals:['storia','agency_site','imove']},[{portalId:'storia',enabled:false},{portalId:'agency_site',enabled:false},{portalId:'imove',enabled:false}]);
 expect(db.finish).not.toHaveBeenCalled();
 await runUnitOperationOnce(job,db,deps);
 expect(await runUnitOperationOnce(job,db,deps)).toMatchObject({processed:1,finished:true});
 expect(state.mutations).toBe(3);expect(db.finish).toHaveBeenCalledExactlyOnceWith('job',null);
});
it('reia elementul persistent fără încă o mutație SQL',async()=>{
 const {db,deps,state}=fixture();await db.step(job.id);expect(state.mutations).toBe(1);
 await runUnitOperationOnce(job,db,deps);expect(state.mutations).toBe(1);expect(state.index).toBe(1);
});
it('înregistrează erorile portalurilor și continuă restul unităților',async()=>{
 const {db,deps}=fixture();deps.applySelection=vi.fn(async()=>[{portalId:'storia',ok:false,message:'Conexiune indisponibilă'},{portalId:'agency_site',ok:true,message:null},{portalId:'imove',ok:true,message:null}]);
 await runUnitOperationOnce(job,db,deps);
 expect(db.advance).toHaveBeenCalledWith('job',0,'storia: Conexiune indisponibilă');
 expect(db.release).toHaveBeenCalledWith('job');
});
it('raportează portalurile fără răspuns, nu le consideră succes',async()=>{
 const {db,deps}=fixture();deps.applySelection=vi.fn(async()=>[]);
 await runUnitOperationOnce(job,db,deps);
 expect(db.advance).toHaveBeenCalledWith('job',0,'storia: operație neconfirmată.; agency_site: operație neconfirmată.; imove: operație neconfirmată.');
});
it('ștergerea pune retragerile în coada existentă înainte de debifare',async()=>{
 const {db,deps}=fixture();const remove={...job,operation:'remove' as const};
 await runUnitOperationOnce(remove,db,deps);
 expect(deps.enqueueDeletion).toHaveBeenCalledWith(remove,'copy-0');
 const enqueueOrder=deps.enqueueDeletion.mock.invocationCallOrder[0];const selectionOrder=deps.applySelection.mock.invocationCallOrder[0];
 if(enqueueOrder===undefined||selectionOrder===undefined)throw new Error('Missing calls');
 expect(enqueueOrder).toBeLessThan(selectionOrder);
});