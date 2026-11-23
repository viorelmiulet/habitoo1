import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { AIProvider } from '@/lib/ai/providers/types';
import { approachSentences,validateApproach,type ApproachFacts } from './approach';

export async function generateApproach(provider:Pick<AIProvider,'generate'>,sentences:string[]){
  const generated=await provider.generate({system:'Pregătește o ciornă de abordare pentru proprietar. Răspunde strict JSON {"sentences":string[]}. Alege între 2 și 4 propoziții din lista dată, copiate exact, în ordinea lor. Nu inventa fapte, servicii, promisiuni sau contacte. Nu trimite nimic.',messages:[{role:'user',content:JSON.stringify({sentences})}],tools:[],maxOutputTokens:800});
  let raw:unknown;try{raw=JSON.parse(generated.text.replace(/^```(?:json)?\s*|\s*```$/g,''));}catch{throw new Error('Ciorna AI nu a trecut verificarea.');}
  const text=validateApproach(raw,sentences);if(!text)throw new Error('Ciorna AI nu a trecut verificarea.');
  return {text,generated};
}
export async function loadApproachFacts(db:SupabaseClient<Database>,org:string,id:string,kind:'map'|'argus'):Promise<ApproachFacts>{
  if(kind==='argus'){
    const {getArgusPropertyDetail}=await import('@/lib/argus/search.server');
    const {argusClientIp}=await import('@/lib/argus/http.server');
    const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
    const p=await getArgusPropertyDetail(supabaseAdmin,org,id,{clientIp:await argusClientIp()});
    if(!p)throw new Error('Anunțul nu mai este disponibil.');
    return {title:p.title,city:p.city,rooms:p.rooms,area:p.surface,price:p.price,currency:p.currency};
  }
  const {data:p,error}=await db.from('listings').select('title,city,rooms,surface,price,currency').eq('id',id).eq('is_owner',true).maybeSingle();
  if(error || !p)throw new Error('Anunțul nu mai este disponibil.');
  return {title:p.title,city:p.city,rooms:p.rooms,area:p.surface,price:p.price,currency:p.currency};
}
export async function approachDraft(db:SupabaseClient<Database>,userId:string,org:string,id:string,kind:'map'|'argus'){
  const facts=await loadApproachFacts(db,org,id,kind);
  const [{data:profile},{data:agency}]=await Promise.all([db.from('profiles').select('full_name').eq('id',userId).eq('organization_id',org).maybeSingle(),db.from('organizations').select('name').eq('id',org).maybeSingle()]);
  const sentences=approachSentences(facts,profile?.full_name??'agentul dumneavoastră',agency?.name??'agenția imobiliară');
  const {resolveAiProvider}=await import('@/lib/ai/providers/registry.server');
  const provider=resolveAiProvider('fast');if(!provider)throw new Error('AI nu este configurat.');
  const {chargedAiFallback}=await import('@/lib/ai/credits/credits.server');
  const started=Date.now();
  const completed=await chargedAiFallback({organizationId:org,userId},'fast',provider,p=>generateApproach(p,sentences));
  const {writeAiUsage}=await import('@/lib/ai/usage/tracking.server');
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  await writeAiUsage(supabaseAdmin as never,{organization_id:org,user_id:userId,provider:completed.provider.id,model:completed.provider.model,capability:'prospecting_approach',input_tokens:completed.result.generated.inputTokens,output_tokens:completed.result.generated.outputTokens,latency_ms:Date.now()-started,success:true,tool_calls:0,fallback_used:completed.fallbackUsed});
  return completed.result.text;
}