import {beforeEach,it,expect,vi} from 'vitest';

const mocks=vi.hoisted(()=>({
 access:vi.fn(),write:vi.fn(),upsert:vi.fn(),activated:vi.fn(),
 state:{job:null as null|Record<string,unknown>,perm:null as null|Record<string,unknown>},
}));
vi.mock('@tanstack/react-start',()=>({createServerFn:()=>{
 let validate:(v:unknown)=>unknown=v=>v;
 const builder={middleware:()=>builder,inputValidator:(v:(x:unknown)=>unknown)=>{validate=v;return builder;},handler:(handler:(v:unknown)=>unknown)=>async(input:{data:unknown})=>handler({data:validate(input.data),context:{userId:'00000000-0000-4000-8000-000000000010',supabase:{rpc:mocks.access,from:(name:string)=>{
  const chain={select:()=>chain,eq:()=>chain,order:()=>chain,limit:()=>chain,single:async()=>({data:{organization_id:'org'},error:null}),maybeSingle:async()=>({data:name==='development_portal_jobs'?mocks.state.job:name==='agent_development_permissions'?mocks.state.perm:null,error:null}),upsert:mocks.upsert};return chain;
 }}}})};return builder;
}}));
vi.mock('@/lib/org-access',()=>({requireActiveOrgAuth:{}}));
vi.mock('@/lib/portals.functions',()=>({activatedPortalIds:mocks.activated}));
vi.mock('@/lib/feed-registry',()=>({feedDefinitions:()=>[]}));
vi.mock('@/integrations/supabase/client.server',()=>({supabaseAdmin:{rpc:mocks.write}}));
vi.mock('@/lib/site-feed/complete-read.server',()=>({readCompleteRows:async()=>[]}));
import {setDevelopmentPortalSelections,setDevelopmentPortalSelection,getDevelopmentPortalSelections} from './portal-selections.functions';
const id='00000000-0000-4000-8000-000000000030';
const jobId='00000000-0000-4000-8000-000000000070';
const changes=[{portalKey:'clickimob',enabled:true},{portalKey:'imobli',enabled:true},{portalKey:'storia',enabled:false}];
beforeEach(()=>{
 vi.clearAllMocks();mocks.state.job=null;mocks.state.perm=null;mocks.access.mockResolvedValue({data:true,error:null});mocks.activated.mockResolvedValue(new Set(['clickimob','imobli']));mocks.upsert.mockResolvedValue({error:null});mocks.write.mockResolvedValue({data:{ok:true,jobId,changes:changes.map(c=>({portal_key:c.portalKey,enabled:c.enabled}))},error:null});
});
it('apelul nou transmite toate modificările într-un singur RPC după verificarea drepturilor',async()=>{
 const result=await setDevelopmentPortalSelections({data:{id,changes}});
 expect(result.jobId).toBe(jobId);expect(mocks.access).toHaveBeenCalledWith('can_access_development',{_id:id,_edit:true});expect(mocks.write).toHaveBeenCalledTimes(1);
 expect(mocks.write).toHaveBeenCalledWith('set_development_portal_selections',{_development_id:id,_actor_id:'00000000-0000-4000-8000-000000000010',_changes:[{portal_key:'clickimob',enabled:true},{portal_key:'imobli',enabled:true},{portal_key:'storia',enabled:false}],_eligible_portals:expect.arrayContaining(['clickimob','imobli','storia'])});expect(mocks.upsert).not.toHaveBeenCalled();
});
it('un portal neeligibil este numit înaintea oricărei scrieri',async()=>{
 await expect(setDevelopmentPortalSelections({data:{id,changes:[...changes,{portalKey:'bad-portal',enabled:true}]}})).rejects.toThrow('bad-portal: Portalul nu este eligibil');expect(mocks.write).not.toHaveBeenCalled();expect(mocks.upsert).not.toHaveBeenCalled();
});
it('eroarea atomică Storia numește portalul și este transmisă apelantului',async()=>{
 mocks.write.mockResolvedValue({data:null,error:{message:'storia: Conectează contul dezvoltator Storia pentru ansambluri.'}});
 await expect(setDevelopmentPortalSelections({data:{id,changes:[{portalKey:'storia',enabled:true}]}})).rejects.toThrow('Storia.ro: Conectează contul dezvoltator Storia pentru ansambluri.');expect(mocks.write).toHaveBeenCalledTimes(1);expect(mocks.upsert).not.toHaveBeenCalled();
});
it('refuzul drepturilor nu încarcă persistarea privilegiată',async()=>{
 mocks.access.mockResolvedValue({data:false,error:null});await expect(setDevelopmentPortalSelections({data:{id,changes}})).rejects.toThrow('Nu ai drepturi');expect(mocks.write).not.toHaveBeenCalled();expect(mocks.activated).not.toHaveBeenCalled();
});
it('get întoarce lista jobului și normalizează jobul vechi fără listă',async()=>{
 const legacy={id:jobId,portal_key:'storia',enabled:false,status:'done',total:2,processed:2,result:{},last_error:null,changes:null};mocks.state.job=legacy;
 expect((await getDevelopmentPortalSelections({data:{id}})).job?.changes).toEqual([{portal_key:'storia',enabled:false}]);
 const list=[{portal_key:'clickimob',enabled:true},{portal_key:'storia',enabled:false}];mocks.state.job={...legacy,changes:list};expect((await getDevelopmentPortalSelections({data:{id}})).job?.changes).toEqual(list);
});
it('apelul vechi rămâne un singur upsert, fără noul RPC',async()=>{
 expect(await setDevelopmentPortalSelection({data:{id,portalKey:'clickimob',enabled:true}})).toEqual({ok:true});expect(mocks.upsert).toHaveBeenCalledWith({development_id:id,portal_key:'clickimob',enabled:true},{onConflict:'development_id,portal_key'});expect(mocks.write).not.toHaveBeenCalled();
});
const asAgent=(perm:null|{can_create:boolean;allowed_portals:string[]})=>{mocks.state.perm=perm;mocks.access.mockImplementation(async(name:string)=>({data:name==='can_access_development',error:null}));};
it('agentul activează doar portalurile permise, în ambele căi, și poate debifa orice',async()=>{
 asAgent({can_create:false,allowed_portals:['clickimob']});
 await expect(setDevelopmentPortalSelections({data:{id,changes:[{portalKey:'clickimob',enabled:true},{portalKey:'imobli',enabled:true}]}})).rejects.toThrow('Nepermis de administrator');
 await expect(setDevelopmentPortalSelection({data:{id,portalKey:'imobli',enabled:true}})).rejects.toThrow('imobli: Nepermis de administrator');
 expect(mocks.write).not.toHaveBeenCalled();expect(mocks.upsert).not.toHaveBeenCalled();
 await setDevelopmentPortalSelections({data:{id,changes:[{portalKey:'clickimob',enabled:true},{portalKey:'imobli',enabled:false},{portalKey:'storia',enabled:false}]}});expect(mocks.write).toHaveBeenCalledTimes(1);
 await setDevelopmentPortalSelection({data:{id,portalKey:'imobli',enabled:false}});expect(mocks.upsert).toHaveBeenCalledTimes(1);
});
it('agentul fără rând nu poate activa nimic; grila primește lista permisă',async()=>{
 asAgent(null);
 await expect(setDevelopmentPortalSelection({data:{id,portalKey:'clickimob',enabled:true}})).rejects.toThrow('Nepermis de administrator');
 asAgent({can_create:true,allowed_portals:['imobli','neeligibil']});
 expect((await getDevelopmentPortalSelections({data:{id}})).allowedPortals).toEqual(['imobli']);
});
it('administratorul activează orice portal eligibil, fără listă restrictivă',async()=>{
 expect((await getDevelopmentPortalSelections({data:{id}})).allowedPortals).toBeNull();
 await setDevelopmentPortalSelections({data:{id,changes}});expect(mocks.write).toHaveBeenCalledTimes(1);
});
