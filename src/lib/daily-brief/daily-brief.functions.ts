import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireActiveOrgAuth } from '@/lib/org-access';
export const getDailyBrief=createServerFn({method:'POST'}).middleware([requireActiveOrgAuth]).inputValidator((d:unknown)=>z.object({refresh:z.boolean().optional(),agentId:z.string().uuid().optional()}).parse(d)).handler(async({data,context})=>{
 const {dailyActions}=await import('./service.server');return dailyActions(context.supabase,context.userId,data);
});
export const setHomeActionPreference=createServerFn({method:'POST'}).middleware([requireActiveOrgAuth]).inputValidator((d:unknown)=>z.object({actionId:z.string().min(1).max(150),mode:z.enum(['snooze','ignore']),agentId:z.string().uuid().optional()}).parse(d)).handler(async({data,context})=>{
 const {data:org,error}=await context.supabase.rpc('current_org');if(error||!org)throw new Error('Agenția nu este disponibilă.');
 const {loadDailyBrief}=await import('./data.server');const list=await loadDailyBrief(context.supabase,org,context.userId,new Date(),data.agentId);
 if(!list.actions.some(a=>a.id===data.actionId))throw new Error('Acțiunea nu este disponibilă.');
 const {error:saveError}=await context.supabase.from('home_action_preferences').upsert({user_id:context.userId,organization_id:org,action_key:data.actionId,ignored:data.mode==='ignore',snoozed_until:data.mode==='snooze'?new Date(Date.now()+86400000).toISOString():null},{onConflict:'user_id,action_key'});if(saveError)throw new Error('Preferința nu a putut fi salvată.');return {ok:true};
});
