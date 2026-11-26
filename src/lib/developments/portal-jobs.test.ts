import {it,expect,vi} from 'vitest';
import {runDevelopmentPortalJob,applyDevelopmentPortalChanges,type DevelopmentPortalJob} from './portal-jobs';
const job:DevelopmentPortalJob={id:'j',organization_id:'o',development_id:'d',portal_key:'cauta',enabled:true,requested_by:'a',attempts:1,total:2};
it('unitatea retrasă manual este sărită fără cereri către portaluri',async()=>{
 const apply=vi.fn();const advance=vi.fn();const release=vi.fn();
 await runDevelopmentPortalJob(job,{step:async()=>({index:0,propertyId:'copy',portals:['cauta'],skip:true}),advance,release,finish:vi.fn()},apply);
 expect(apply).not.toHaveBeenCalled();expect(advance).toHaveBeenCalledWith('j',0,null);expect(release).toHaveBeenCalledWith('j');
});
it('erorile sunt păstrate în rezultat și finalizarea se produce după ultima unitate',async()=>{
 const finish=vi.fn(),advance=vi.fn();
 await runDevelopmentPortalJob(job,{step:async()=>({index:1,propertyId:'copy',portals:['cauta'],skip:false}),advance,release:vi.fn(),finish},async()=>[{ok:false,message:'Fără locuri libere'}]);
 expect(advance).toHaveBeenCalledWith('j',1,'cauta: Fără locuri libere');expect(finish).toHaveBeenCalledWith('j',null);
});
it('drepturile pierdute opresc operația înaintea oricărei cereri către portal',async()=>{
 const apply=vi.fn(),finish=vi.fn();await runDevelopmentPortalJob(job,{step:async()=>{throw new Error('Nu mai ai drepturi să editezi acest ansamblu.');},advance:vi.fn(),release:vi.fn(),finish},apply);
 expect(apply).not.toHaveBeenCalled();expect(finish).toHaveBeenCalledWith('j','Nu mai ai drepturi să editezi acest ansamblu.');
});
const changes=[{portal_key:'clickimob',enabled:true},{portal_key:'cauta-ro',enabled:true},{portal_key:'imobli',enabled:false}];
it('un singur pas aplică toate modificările, grupate cu drepturile originale',async()=>{
 const apply=vi.fn(async(input:Parameters<Parameters<typeof applyDevelopmentPortalChanges>[2]>[0])=>({results:input.data.selections.map(s=>({portalId:s.portalId,ok:true,message:null}))}));
 const step=vi.fn(async()=>({index:0,propertyId:'copy',portals:changes.map(c=>c.portal_key),skip:false,changes}));const advance=vi.fn(),finish=vi.fn();
 await runDevelopmentPortalJob({...job,total:1,changes},{step,advance,finish,release:vi.fn()},(j,i)=>applyDevelopmentPortalChanges(j,i,apply));
 expect(step).toHaveBeenCalledTimes(1);expect(advance).toHaveBeenCalledTimes(1);expect(finish).toHaveBeenCalledTimes(1);
 expect(apply.mock.calls.map(([input])=>({superadmin:input.superadmin,selections:input.data.selections}))).toEqual([
  {superadmin:false,selections:[{portalId:'clickimob',enabled:true},{portalId:'cauta-ro',enabled:true}]},
  {superadmin:true,selections:[{portalId:'imobli',enabled:false}]},
 ]);
});
it('unitatea retrasă primește numai debifările returnate de pasul DB',async()=>{
 const apply=vi.fn(async(input:Parameters<Parameters<typeof applyDevelopmentPortalChanges>[2]>[0])=>({results:input.data.selections.map(s=>({portalId:s.portalId,ok:true,message:null}))}));
 await applyDevelopmentPortalChanges({...job,changes},{index:0,propertyId:'copy',skip:false,portals:['imobli'],changes:[{portal_key:'imobli',enabled:false}]},apply);
 expect(apply).toHaveBeenCalledTimes(1);expect(apply.mock.calls[0]?.[0].data.selections).toEqual([{portalId:'imobli',enabled:false}]);expect(apply.mock.calls[0]?.[0].superadmin).toBe(true);
});
it('jobul vechi fără changes folosește selecția unică originală',async()=>{
 const apply=vi.fn(async()=>({results:[{portalId:'cauta',ok:true,message:null}]}));
 await applyDevelopmentPortalChanges(job,{index:0,propertyId:'copy',skip:false,portals:['cauta']},apply);
 expect(apply.mock.calls).toHaveLength(1);expect(apply).toHaveBeenCalledWith({organizationId:'o',actorId:'a',superadmin:false,data:{propertyId:'copy',syncExisting:false,selections:[{portalId:'cauta',enabled:true}]}});
});
it('eșecurile și rezultatele lipsă numesc portalul; o excepție la bifări nu oprește debifările',async()=>{
 const advance=vi.fn();const apply=vi.fn(async(input:Parameters<Parameters<typeof applyDevelopmentPortalChanges>[2]>[0])=>{if(!input.superadmin)throw new Error('Indisponibil');return {results:[]};});
 await runDevelopmentPortalJob({...job,total:1,changes},{step:async()=>({index:0,propertyId:'copy',skip:false,portals:[],changes}),advance,finish:vi.fn(),release:vi.fn()},(j,i)=>applyDevelopmentPortalChanges(j,i,apply));
 expect(advance).toHaveBeenCalledWith('j',0,'clickimob: Indisponibil; cauta-ro: Indisponibil; imobli: Operație neconfirmată.');expect(apply).toHaveBeenCalledTimes(2);
});