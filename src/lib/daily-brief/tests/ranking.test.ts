import { describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({enabled:vi.fn(async()=>false),blocked:vi.fn(async()=>null),credits:vi.fn()}));
vi.mock('@/lib/ai/features/features.server',()=>({isAiFeatureEnabled:mocks.enabled}));
vi.mock('@/lib/ai/credits/credits.server',()=>({aiCreditsBlockedMessage:mocks.blocked,withAiCredits:mocks.credits}));
import { generateDailyRanking } from '../sentence.server';
import type { HomeAction } from '../actions';
describe('daily AI without live provider calls',()=>{
 it('AI disabled leaves the factual order without credits or provider calls',async()=>{
  const action:HomeAction={id:'a',entityKey:'lead:a',kind:'new_lead',title:'Contactează lead-ul',reason:'Necontactat',to:'/app/leads',button:'Deschide lead',at:'2026-11-23',agentId:'agent',ageHours:3,source:'Storia',propertyTitle:null};
  expect(await generateDailyRanking('org','agent',[action])).toBeNull();
  expect(mocks.enabled).toHaveBeenCalledWith('org','ai_daily_brief');
  expect(mocks.credits).not.toHaveBeenCalled();
  expect(mocks.blocked).not.toHaveBeenCalled();
 });
});