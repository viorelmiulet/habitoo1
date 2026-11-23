import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database,Json } from '@/integrations/supabase/types';
import { briefDate } from './brief';
import { applyAiOrder, type ActionData } from './actions';
import { loadDailyBrief } from './data.server';
export async function dailyActions(db:SupabaseClient<Database>,userId:string,input:{refresh?:boolean;agentId?:string}={}){
 const {data:org,error}=await db.rpc('current_org');if(error||!org)throw new Error('Agenția nu este disponibilă.');
 // Always calculate current facts/access/preferences, never serve a legacy cached portal action.
 const computed=await loadDailyBrief(db,org,userId,new Date(),input.agentId);
 const date=briefDate(new Date());
 const base=()=>db.from('daily_briefs').select('id,data,ai_sentence,ai_attempted').eq('user_id',userId).eq('organization_id',org).eq('brief_date',date);
 if(input.agentId)return {data:computed,sentence:null};
 const cache=await base().maybeSingle();if(cache.error)throw new Error('Rezumatul nu este disponibil.');
 let ranking:unknown=null;
 const previous=cache.data?.data as unknown as ActionData & {ranking?:unknown};
 if(previous?.version===2)ranking=previous.ranking;
 if(!cache.data){const saved=await db.from('daily_briefs').upsert({user_id:userId,organization_id:org,brief_date:date,data:computed as unknown as Json,ai_attempted:false},{onConflict:'user_id,brief_date',ignoreDuplicates:true});if(saved.error)throw new Error('Rezumatul nu a putut fi salvat.');}
 if(!input.refresh){const claim=await db.from('daily_briefs').update({ai_attempted:true}).eq('user_id',userId).eq('organization_id',org).eq('brief_date',date).eq('ai_attempted',false).select('id');if(claim.error)throw new Error('Rezumatul nu este disponibil.');if(claim.data?.length){const {generateDailyRanking}=await import('./sentence.server');ranking=await generateDailyRanking(org,userId,computed.actions);}}
 const {isAiFeatureEnabled}=await import('@/lib/ai/features/features.server');
 const enabled=await isAiFeatureEnabled(org,'ai_daily_brief');
 // Drop absent IDs and append new facts, but never allow a cached invented ID into the list.
 const r=ranking as {ids?:string[];recommendation?:string}|null;
 const known=new Set(computed.actions.map(a=>a.id));
 const ids=Array.isArray(r?.ids)?r.ids.filter(id=>known.has(id)):[];
 const normalized=ids.length?{ids:[...new Set(ids),...computed.actions.filter(a=>!ids.includes(a.id)).map(a=>a.id)],recommendation:r?.recommendation??''}:null;
 const ordered=enabled?applyAiOrder(computed.actions,normalized):{actions:computed.actions,recommendation:null};
 const result={...computed,actions:ordered.actions};
 const save=await db.from('daily_briefs').update({data:{...result,ranking} as unknown as Json,ai_sentence:ordered.recommendation,updated_at:new Date().toISOString()}).eq('user_id',userId).eq('organization_id',org).eq('brief_date',date);if(save.error)throw new Error('Rezumatul nu a putut fi salvat.');
 return {data:result,sentence:ordered.recommendation};
}
