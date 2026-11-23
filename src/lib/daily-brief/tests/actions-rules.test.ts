import { describe, expect, it } from 'vitest';
import { actionAgentScope, aiActionFacts, applyAiOrder, buildHomeActions, selectActions, type HomeAction } from '../actions';

const now = new Date('2026-11-23T06:00:00Z');
const base = (): Parameters<typeof buildHomeActions>[0] => ({ now, scope: 'agent', leads: [], requests: [], activities: [], events: [], properties: [], matches: [], checks: [], listings: [], contracts: [], proposals: [], map: [] });
const lead = (id = 'lead', agent = 'agent', ageHours = 3) => ({ id, assigned_to: agent, stage: 'new', source: 'Storia', created_at: new Date(now.getTime()-ageHours*3600000).toISOString(), last_interaction_at: null });
const property = { id: 'p', assigned_to: 'agent', title: 'Apartament', city: 'Cluj-Napoca', district: 'Centru', status: 'active', publish_status: 'published', created_at: '2026-09-01', updated_at: '2026-09-01', owner_contact_id: 'owner' };
const build = (patch: Partial<Parameters<typeof buildHomeActions>[0]>) => selectActions(buildHomeActions({ ...base(), ...patch }), [], now);
const required = { code: 'missing_title', severity: 'required' as const, message: 'Titlu lipsă', field: 'Titlu', tab: 'description' as const, target: 'title' };

describe('Home action rules', () => {
  it('portal publication failures never become Home actions', () => {
    expect(build({ properties: [property], checks: [{ propertyId: 'p', issues: [{ ...required, code: 'portal_validation' }, { ...required, code: 'unpublished_with_portals' }] }], listings: [{ property_id: 'p', status: 'error' }] }).map(a=>a.kind)).toEqual(['owner']);
  });
  it('one property appears once across viewing, required, old and owner actions', () => {
    const actions = build({ properties: [property], activities: [{ id: 'visit', assigned_to: 'agent', property_id: 'p', kind: 'viewing', starts_at: '2026-11-23T10:00:00Z' }], checks: [{ propertyId: 'p', issues: [required] }], listings: [{ property_id: 'p', status: 'published', published_at: '2026-09-01' }] });
    expect(actions).toHaveLength(1);
    expect(actions[0]?.kind).toBe('viewing');
  });
  it('a lead older than 2h appears, one exactly 2h does not', () => {
    expect(build({ leads: [lead('old'), lead('boundary','agent',2)] }).map(a=>a.id)).toEqual(['new_lead:old']);
  });
  it.each(['call','message','note','viewing'])('post-receipt %s activity prevents a contact action', kind => {
    expect(build({ leads: [lead()], activities: [{ id: 'a', lead_id: 'lead', kind, assigned_to: 'agent', created_at: '2026-11-23T04:00:00Z', starts_at: '2026-11-24T12:00:00Z', done: true }] })).toEqual([]);
  });
  it('an activity before receipt does not imply contacting a new lead', () => {
    expect(build({ leads: [lead()], activities: [{ id: 'a', lead_id: 'lead', kind: 'note', assigned_to: 'agent', created_at: '2026-11-22', updated_at: '2026-11-23T05:00:00Z', starts_at: '2026-11-22', done: true }] })[0]?.kind).toBe('new_lead');
  });
  it('agents cannot request another agent and only see their own assigned rows', () => {
    expect(()=>actionAgentScope('agent',false,'other')).toThrow();
    expect(build({ leads: [lead('mine'),lead('other','other')], activities: [{ id:'v', assigned_to:'other', kind:'viewing', starts_at:'2026-11-23T10:00:00Z' }], properties: [{...property,assigned_to:'other'}], contracts: [{id:'c',assigned_to:'other',status:'sent',sent_at:'2026-11-22'}] }).map(a=>a.id)).toEqual(['new_lead:mine']);
    expect(actionAgentScope('admin',true)).toBeNull();
    expect(actionAgentScope('admin',true,'agent')).toBe('agent');
  });
  it('snoozed and ignored actions are hidden per preference, then snooze expires after one day', () => {
    const actions=build({leads:[lead('one'),lead('two')]});
    const prefs=[{action_key:'new_lead:one',ignored:false,snoozed_until:'2026-11-24T06:00:00Z'},{action_key:'new_lead:two',ignored:true,snoozed_until:null}];
    expect(selectActions(actions,prefs,now)).toEqual([]);
    expect(selectActions(actions,prefs,new Date('2026-11-24T06:00:00Z')).map(a=>a.id)).toEqual(['new_lead:one']);
    expect(selectActions(actions,[],now)).toHaveLength(2);
  });
  it('AI cannot add, repeat or omit actions; valid ordering retains the exact actions', () => {
    const actions=build({leads:[lead('one'),lead('two')]});
    for(const ids of [['invented',actions[0]?.id],[actions[0]?.id,actions[0]?.id],[]]) expect(applyAiOrder(actions,{ids,recommendation:'Prioritize'})).toEqual({actions,recommendation:null});
    expect(applyAiOrder(actions,{ids:actions.map(a=>a.id).reverse(),recommendation:'Contactează lead-urile.'}).actions).toEqual([...actions].reverse());
  });
  it('AI receives only opaque IDs and factual metadata, never client information', () => {
    const row = {...build({leads:[lead()]})[0],title:'Client Secret',reason:'0722222222 secret note',propertyTitle:'Apartament',source:'Storia'} as HomeAction;
    expect(aiActionFacts([row])).toEqual([{id:'0',type:'new_lead',ageHours:3,source:'Storia',propertyTitle:'Apartament'}]);
  });
  it('supports matches, contracts, collaboration and local MAP, excludes unrelated geography and Facebook', () => {
    const actions=build({properties:[{...property,owner_contact_id:null}],requests:[{id:'r',assigned_to:'agent'}],matches:[{id:'m',agent_id:'agent',property_id:'p',request_id:'r',status:'new',score:90,created_at:'2026-11-23'}],contracts:[{id:'c',assigned_to:'agent',status:'signed',kind:'exclusive_representation',signed_at:'2026-11-01T06:00:00Z',duration_days:30}],proposals:[{id:'proposal',property_id:'p',status:'pending',created_at:'2026-11-23'}],map:[{id:'map',is_owner:true,city:'Cluj-Napoca',source:'imoradar',first_seen_at:'2026-11-23T03:00:00Z'},{id:'facebook',is_owner:true,city:'Cluj-Napoca',source:'facebook',first_seen_at:'2026-11-23T03:00:00Z'},{id:'other',is_owner:true,city:'Iași',source:'imoradar',first_seen_at:'2026-11-23T03:00:00Z'}]});
    expect(actions.map(a=>a.kind)).toEqual(['match','contract','map']);
    expect(actions.find(a=>a.kind==='contract')?.reason).toContain('8 zile');
  });
});