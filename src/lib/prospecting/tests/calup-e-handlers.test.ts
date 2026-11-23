import { describe,it,expect,vi,beforeEach } from 'vitest';
const m=vi.hoisted(()=>({enabled:true,approach:vi.fn(),duplicates:vi.fn(),insights:vi.fn(),check:vi.fn()}));
vi.mock('@tanstack/react-start',()=>({createServerFn:()=>{const b={middleware:()=>b,inputValidator:()=>b,handler:(fn:unknown)=>fn};return b;}}));
vi.mock('@/lib/org-access',()=>({requireActiveOrgAuth:{}}));
vi.mock('@/lib/ai/features/features.server',()=>({isAiFeatureEnabled:async()=>m.enabled}));
vi.mock('../approach.server',()=>({approachDraft:m.approach}));
vi.mock('../property-duplicates.server',()=>({findPropertyDuplicates:m.duplicates}));
vi.mock('@/lib/ai/agents/manager/agency-insights.server',()=>({readAgencyInsight:m.insights}));
vi.mock('@/lib/contracts/check.server',()=>({checkContractSources:m.check}));
import { generateOwnerApproach,findPossiblePropertyDuplicates } from '../enrichment.functions';
import { getAgencyInsight,agencyInsightsStatus } from '@/lib/ai/agents/manager/agency-insights.functions';
import { checkContractBeforeSigning } from '@/lib/contracts/check.functions';
const id='22222222-2222-4222-8222-222222222222';
function context(role=false,contract:Record<string,unknown>|null={organization_id:'org',created_by:'u',assigned_to:'u'}){
  const rpc=vi.fn(async(name:string)=>({data:name==='current_org'?'org':name==='has_role'?role:false,error:null}));
  const from=vi.fn(()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:contract,error:null})};return q;});
  return {userId:'u',supabase:{rpc,from}};
}
async function invoke<T>(fn:unknown,data:unknown,ctx:unknown):Promise<T>{return (fn as (input:unknown)=>Promise<T>)({data,context:ctx});}
beforeEach(()=>{m.enabled=true;vi.clearAllMocks();});
describe('calup E — bariere server',()=>{
  it('AI oprit: nicio generare, comparație sau verificare contract',async()=>{
    m.enabled=false;const ctx=context();
    expect(await invoke(generateOwnerApproach,{id,kind:'map'},ctx)).toMatchObject({ok:false});
    expect(await invoke(findPossiblePropertyDuplicates,{id,kind:'map'},ctx)).toBeNull();
    expect(await invoke(checkContractBeforeSigning,{id},ctx)).toBeNull();
    expect(m.approach).not.toHaveBeenCalled();expect(m.duplicates).not.toHaveBeenCalled();expect(m.check).not.toHaveBeenCalled();
  });
  it('agency_admin verificat prin rol protejat; agentul nu poate cere raportul',async()=>{
    const ctx=context(false);await expect(invoke(getAgencyInsight,{query:'untouched_leads'},ctx)).rejects.toThrow();
    expect(m.insights).not.toHaveBeenCalled();
    expect(ctx.supabase.rpc).toHaveBeenCalledWith('has_role',{_user_id:'u',_role:'agency_admin'});
  });
  it('administratorul folosește agenția verificată și numai query enum',async()=>{
    const ctx=context(true);m.insights.mockResolvedValue({items:[]});
    await invoke(getAgencyInsight,{query:'properties_without_leads'},ctx);
    expect(m.insights).toHaveBeenCalledWith(ctx.supabase,'org','properties_without_leads');
    expect(await invoke(agencyInsightsStatus,undefined,ctx)).toMatchObject({allowed:true});
  });
  it('mesajul MAP/Argus transmite numai ID și agenția serverului',async()=>{
    const ctx=context();m.approach.mockResolvedValue('ciornă');
    expect(await invoke(generateOwnerApproach,{id,kind:'map',organization_id:'other'},ctx)).toEqual({ok:true,text:'ciornă'});
    expect(m.approach).toHaveBeenCalledWith(ctx.supabase,'u','org',id,'map');
    expect(ctx.supabase.from).not.toHaveBeenCalled();
  });
  it('agentul nu poate verifica un contract al altui agent',async()=>{
    const ctx=context(false,{organization_id:'org',created_by:'other',assigned_to:'other'});
    await expect(invoke(checkContractBeforeSigning,{id},ctx)).rejects.toThrow();expect(m.check).not.toHaveBeenCalled();
  });
  it('duplicatele sunt calculate numai în agenția și agentul verificat',async()=>{
    const ctx=context();m.duplicates.mockResolvedValue({matches:[]});
    await invoke(findPossiblePropertyDuplicates,{id,kind:'property'},ctx);
    expect(m.duplicates).toHaveBeenCalledWith(ctx.supabase,'org','u','property',id);
  });
});