import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { ActionData, HomeAction } from '../actions';
const mocks=vi.hoisted(()=>({load:vi.fn(),generate:vi.fn(),enabled:vi.fn(async()=>true)}));
vi.mock('../data.server',()=>({loadDailyBrief:mocks.load}));
vi.mock('../sentence.server',()=>({generateDailyRanking:mocks.generate}));
vi.mock('@/lib/ai/features/features.server',()=>({isAiFeatureEnabled:mocks.enabled}));
import { dailyActions } from '../service.server';
const action=(id:string):HomeAction=>({id,entityKey:id,kind:'new_lead',title:id,reason:'Necontactat',to:'/app/leads',button:'Deschide lead',at:'2026-11-23',agentId:'agent',source:'Storia',propertyTitle:null,ageHours:3});
const computed:ActionData={version:2,actions:[action('a'),action('b')],computedAt:'2026-11-23',agents:[],isAdmin:false};
function fakeDb(){
 let row:{data:unknown;ai_attempted:boolean}|null=null;
 const queries:{filters:[string,unknown][];patch:Record<string,unknown>|null}[]=[];
 const db={rpc:async()=>({data:'org',error:null}),from:()=>{
  const state={filters:[] as [string,unknown][],patch:null as Record<string,unknown>|null};queries.push(state);
  const query={eq:(key:string,value:unknown)=>{state.filters.push([key,value]);return query;},select:()=>{
   if(state.patch){if(!row||row.ai_attempted){return Promise.resolve({data:[],error:null});}row.ai_attempted=true;return Promise.resolve({data:[{id:'daily'}],error:null});}
   return query;
  },maybeSingle:async()=>({data:row?{id:'daily',data:row.data,ai_attempted:row.ai_attempted}:null,error:null}),upsert:async(patch:Record<string,unknown>)=>{state.filters.push(['user_id',patch['user_id']],['organization_id',patch['organization_id']]);row={data:patch['data'],ai_attempted:false};return {error:null};},update:(patch:Record<string,unknown>)=>{state.patch=patch;return query;},then:(resolve:(v:{error:null})=>void)=>{if(row&&state.patch&&'data' in state.patch)row.data=state.patch['data'];return resolve({error:null});}};
  return query;
 }} as unknown as SupabaseClient<Database>;
 return {db,queries};
}
beforeEach(()=>{mocks.load.mockResolvedValue(computed);mocks.generate.mockReset().mockResolvedValue({ids:['b','a'],recommendation:'Contactează lead-urile.'});mocks.enabled.mockResolvedValue(true);});
describe('Home and assistant shared daily result',()=>{
 it('uses the same stored ordering twice with a single daily AI claim',async()=>{
  const {db,queries}=fakeDb();const home=await dailyActions(db,'agent');const assistant=await dailyActions(db,'agent');
  expect(home.data.actions.map(a=>a.id)).toEqual(['b','a']);
  expect(assistant.data.actions).toEqual(home.data.actions);
  expect(mocks.generate).toHaveBeenCalledTimes(1);
  expect(queries.every(q=>q.filters.some(([k,v])=>k==='user_id'&&v==='agent')&&q.filters.some(([k,v])=>k==='organization_id'&&v==='org'))).toBe(true);
 });
 it('refresh recalculates facts and appends new actions without another AI call',async()=>{
  const {db}=fakeDb();await dailyActions(db,'agent');mocks.load.mockResolvedValue({...computed,actions:[action('b'),action('c')]});
  const result=await dailyActions(db,'agent',{refresh:true});
  expect(result.data.actions.map(a=>a.id)).toEqual(['b','c']);
  expect(mocks.generate).toHaveBeenCalledTimes(1);
 });
});