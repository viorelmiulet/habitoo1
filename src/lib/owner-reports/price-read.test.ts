import { describe,it,expect,vi } from 'vitest';
import { loadPriceEstimate,readComplete } from './price.server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

type Row=Record<string,unknown>;
function database(){
  const calls:{table:string;op:string;args:unknown[]}[]=[];
  const subject={id:'p',title:'Apartament',property_type:'apartment',transaction_kind:'sale',city:'București',usable_surface:60,surface:60,rooms:2,price:120000,currency:'EUR'};
  const own=Array.from({length:5},(_,i)=>({...subject,id:`c${i}`,price:80000+i*10000}));
  const from=(table:string)=>{
    let single=false;
    const q:Record<string,unknown>={};
    for(const op of ['select','eq','neq','is','order','range','limit'])q[op]=(...args:unknown[])=>{calls.push({table,op,args});return q;};
    q['maybeSingle']=()=>{single=true;return q;};
    q['then']=(resolve:(v:unknown)=>void)=>{
      let data:unknown=table==='properties'?(single?subject:own):table==='acp_analyses'?{id:'a'}:[];
      if(table==='acp_comparables')data=[{id:'private',source_property_id:'other-agent',source_name:'Habitoo',source_type:'own_properties',snapshot:{title:'Private',subject:{propertyType:'apartment',transactionType:'sale',city:'București',usableArea:60,rooms:2,price:1,currency:'EUR'}}}];
      resolve({data,error:null});
    };
    return q;
  };
  return {db:{from} as unknown as SupabaseClient<Database>,calls};
}
describe('citirea comparabilelor',()=>{
  it('citește toate paginile, peste 1000 de rânduri',async()=>{
    const rows=Array.from({length:1386},(_,id)=>({id}));const query=vi.fn(async(a:number,b:number)=>({data:rows.slice(a,b+1),error:null}));
    const result=await readComplete(query);expect(result).toHaveLength(1386);expect(query.mock.calls).toEqual([[0,499],[500,999],[1000,1499]]);
  });
  it('eroarea nu devine un interval calculat pe o listă incompletă',async()=>{
    await expect(readComplete(async()=>({data:null,error:{message:'bad'}}))).rejects.toThrow();
  });
  it('agenție, agent, anunț și analiză izolate; sursa MAP exclude Facebook',async()=>{
    const {db,calls}=database();const result=await loadPriceEstimate(db,'org','p','agent');
    expect(result.status).toBe('ready');
    if(result.status==='ready')expect(result.comparables.some(c=>c.title==='Private')).toBe(false);
    expect(calls).toContainEqual({table:'properties',op:'eq',args:['organization_id','org']});
    expect(calls).toContainEqual({table:'properties',op:'eq',args:['assigned_to','agent']});
    expect(calls).toContainEqual({table:'acp_comparables',op:'eq',args:['analysis_id','a']});
    expect(calls).toContainEqual({table:'listings',op:'neq',args:['source','facebook']});
    expect(calls.filter(c=>c.op==='select').every(c=>!String(c.args[0]).includes('phone'))).toBe(true);
  });
});