import { describe, expect, it } from 'vitest';
import { completeRows, loadDailyBrief } from '../data.server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

type Row=Record<string,unknown>;
function fakeDb(admin=false) {
  const calls:{table:string;filters:[string,unknown][];range:[number,number]|null}[]=[];
  const tables:Record<string,Row[]>={profiles:[{id:'agent',full_name:'Agent',organization_id:'org',is_active:true}],leads:[{id:'mine',assigned_to:'agent',organization_id:'org',stage:'new',source:'Storia',created_at:'2026-11-23T01:00:00Z',deleted_at:null},{id:'another-agent',assigned_to:'other',organization_id:'org',stage:'new',created_at:'2026-11-23T01:00:00Z',deleted_at:null},{id:'another-org',assigned_to:'agent',organization_id:'other-org',stage:'new',created_at:'2026-11-23T01:00:00Z',deleted_at:null}]};
  const db={rpc:async()=>({data:admin,error:null}),from:(table:string)=>{
    const call={table,filters:[] as [string,unknown][],range:null as [number,number]|null};calls.push(call);
    let rows=tables[table]??[];
    const query={select:()=>query,eq:(key:string,value:unknown)=>{call.filters.push([key,value]);rows=rows.filter(r=>r[key]===value);return query;},is:(key:string,value:unknown)=>{call.filters.push([key,value]);rows=rows.filter(r=>r[key]===value);return query;},neq:()=>query,order:()=>query,in:()=>query,gte:()=>query,range:(a:number,b:number)=>{call.range=[a,b];return Promise.resolve({data:rows.slice(a,b+1),error:null});}};
    return query;
  }} as unknown as SupabaseClient<Database>;
  return {db,calls};
}
describe('complete caller-scoped Home reads',()=>{
 it('pages beyond the first 500 rows without losing actions',async()=>{
  const data=Array.from({length:1201},(_,id)=>({id}));const ranges:number[][]=[];
  expect(await completeRows(async(a,b)=>{ranges.push([a,b]);return {data:data.slice(a,b+1),error:null};})).toHaveLength(1201);
  expect(ranges).toEqual([[0,499],[500,999],[1000,1499]]);
 });
 it('applies organization and responsible agent before returning actions',async()=>{
  const {db,calls}=fakeDb();const result=await loadDailyBrief(db,'org','agent',new Date('2026-11-23T06:00:00Z'));
  expect(result.actions.map(a=>a.id)).toEqual(['new_lead:mine']);
  expect(calls.find(c=>c.table==='leads')?.filters).toContainEqual(['assigned_to','agent']);
  expect(calls.filter(c=>c.table!=='listings').every(c=>c.filters.some(([k,v])=>['organization_id','owner_organization_id'].includes(k)&&v==='org'))).toBe(true);
  expect(calls.some(c=>c.table==='portal_publications'||c.table==='portal_operation_logs')).toBe(false);
 });
 it('admins see the agency, while a foreign agent filter is rejected',async()=>{
  const {db}=fakeDb(true);
  expect((await loadDailyBrief(db,'org','admin',new Date('2026-11-23T06:00:00Z'))).actions).toHaveLength(2);
  await expect(loadDailyBrief(db,'org','admin',new Date('2026-11-23T06:00:00Z'),'foreign')).rejects.toThrow('Agentul nu aparține agenției.');
 });
});