import { describe,it,expect } from 'vitest';
import { agencyQueryFor,canUseAgencyInsights } from '../agency-insights';
import { readAgencyInsight } from '../agency-insights.server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
type Row=Record<string,unknown>;
function db(rows:Record<string,Row[]>){
  const calls:{table:string;op:string;args:unknown[]}[]=[];
  const from=(table:string)=>{
    let data=rows[table]??[];const q:Record<string,unknown>={};
    for(const op of ['select','eq','is','gte','lte','neq','in','order','range'])q[op]=(...args:unknown[])=>{calls.push({table,op,args});if(op==='range')data=data.slice(Number(args[0]),Number(args[1])+1);return q;};
    q['then']=(resolve:(v:unknown)=>void)=>resolve({data,error:null});return q;
  };
  return {client:{from} as unknown as SupabaseClient<Database>,calls};
}
describe('interogări predefinite administrator',()=>{
  it('numai agency_admin și AI activat; superadmin/admin/agent nu sunt substituiți',()=>{
    expect(canUseAgencyInsights(['agency_admin'],true)).toBe(true);
    for(const role of ['superadmin','admin','agent'])expect(canUseAgencyInsights([role],true)).toBe(false);
    expect(canUseAgencyInsights(['agency_admin'],false)).toBe(false);
  });
  it('întrebările cerute aleg exact interogări fixe, nu SQL',()=>{
    expect(agencyQueryFor('cine are lead-uri neatinse?')).toBe('untouched_leads');
    expect(agencyQueryFor("ce anunțuri n-au avut lead-uri luna asta?")).toBe('properties_without_leads');
    expect(agencyQueryFor('SELECT * FROM contacts; DROP TABLE leads')).toBeNull();
  });
  it('proprietăți fără lead-uri luna asta, cu legături și izolare per agenție',async()=>{
    const {client,calls}=db({properties:[{id:'p1',title:'A'},{id:'p2',title:'B'}],leads:[{property_id:'p1'}]});
    const result=await readAgencyInsight(client,'org','properties_without_leads',new Date('2026-11-23T07:19:00Z'));
    expect(result.items).toEqual([{id:'p2',label:'B',href:'/app/properties/p2'}]);
    expect(calls).toContainEqual({table:'properties',op:'eq',args:['organization_id','org']});
    expect(calls).toContainEqual({table:'leads',op:'gte',args:['created_at','2026-10-31T22:00:00.000Z']});
    expect(calls.filter(c=>c.op==='select').every(c=>!String(c.args[0]).includes('phone'))).toBe(true);
  });
  it('un apel efectuat după primirea lead-ului înseamnă contactat; task/întâlnire planificată nu',async()=>{
    const {client,calls}=db({leads:[{id:'l1',assigned_to:'u',created_at:'2026-11-01',last_interaction_at:null,contact_id:'c1'},{id:'l2',assigned_to:'u',created_at:'2026-11-01',last_interaction_at:null,contact_id:'c2'}],activities:[{lead_id:'l1',contact_id:'c1',created_at:'2026-11-02'}],lead_events:[],profiles:[{id:'u',full_name:'Agent'}]});
    const result=await readAgencyInsight(client,'org','untouched_leads');expect(result.items.map(i=>i.id)).toEqual(['l2']);
    expect(calls).toContainEqual({table:'activities',op:'eq',args:['status','done']});
    expect(calls).toContainEqual({table:'activities',op:'in',args:['kind',['call','email','meeting']]});
  });
  it('citire completă peste 1000, fără trunchiere',async()=>{
    const {client}=db({properties:Array.from({length:1386},(_,i)=>({id:String(i),title:'A'})),leads:[]});
    const result=await readAgencyInsight(client,'org','properties_without_leads');expect(result.items).toHaveLength(1386);
  });
});