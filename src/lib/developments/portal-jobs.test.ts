import {it,expect,vi} from 'vitest';
import {runDevelopmentPortalJob,type DevelopmentPortalJob} from './portal-jobs';
const job:DevelopmentPortalJob={id:'j',organization_id:'o',development_id:'d',portal_key:'cauta',enabled:true,requested_by:'a',attempts:1,total:2};
it('unitatea retrasă manual este sărită fără cereri către portaluri',async()=>{
 const apply=vi.fn();const advance=vi.fn();const release=vi.fn();
 await runDevelopmentPortalJob(job,{step:async()=>({index:0,propertyId:'copy',portals:['cauta'],skip:true}),advance,release,finish:vi.fn()},apply);
 expect(apply).not.toHaveBeenCalled();expect(advance).toHaveBeenCalledWith('j',0,null);expect(release).toHaveBeenCalledWith('j');
});
it('erorile sunt păstrate în rezultat și finalizarea se produce după ultima unitate',async()=>{
 const finish=vi.fn(),advance=vi.fn();
 await runDevelopmentPortalJob(job,{step:async()=>({index:1,propertyId:'copy',portals:['cauta'],skip:false}),advance,release:vi.fn(),finish},async()=>[{ok:false,message:'Fără locuri libere'}]);
 expect(advance).toHaveBeenCalledWith('j',1,'Fără locuri libere');expect(finish).toHaveBeenCalledWith('j',null);
});
it('drepturile pierdute opresc operația înaintea oricărei cereri către portal',async()=>{
 const apply=vi.fn(),finish=vi.fn();await runDevelopmentPortalJob(job,{step:async()=>{throw new Error('Nu mai ai drepturi să editezi acest ansamblu.');},advance:vi.fn(),release:vi.fn(),finish},apply);
 expect(apply).not.toHaveBeenCalled();expect(finish).toHaveBeenCalledWith('j','Nu mai ai drepturi să editezi acest ansamblu.');
});