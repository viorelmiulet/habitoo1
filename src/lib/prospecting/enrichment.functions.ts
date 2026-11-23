import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireActiveOrgAuth } from '@/lib/org-access';
const ref=z.object({id:z.string().min(1).max(100),kind:z.enum(['map','argus'])});
export const generateOwnerApproach=createServerFn({method:'POST'}).middleware([requireActiveOrgAuth]).inputValidator((d:unknown)=>ref.parse(d)).handler(async({data,context}):Promise<{ok:true;text:string}|{ok:false;message:string}>=>{
  const {data:org,error}=await context.supabase.rpc('current_org');if(error || !org)return {ok:false,message:'Agenția nu este disponibilă.'};
  const {isAiFeatureEnabled}=await import('@/lib/ai/features/features.server');
  if(!await isAiFeatureEnabled(org,'ai_crm'))return {ok:false,message:'Funcția AI este dezactivată.'};
  if(data.kind==='map' && !z.string().uuid().safeParse(data.id).success)return {ok:false,message:'Anunțul nu este disponibil.'};
  try{const {approachDraft}=await import('./approach.server');return {ok:true,text:await approachDraft(context.supabase,context.userId,org,data.id,data.kind)};}
  catch(error){const {safeAiProviderMessage}=await import('@/lib/ai/providers/types');return {ok:false,message:safeAiProviderMessage(error)};}
});
export const findPossiblePropertyDuplicates=createServerFn({method:'POST'}).middleware([requireActiveOrgAuth]).inputValidator((d:unknown)=>z.object({id:z.string().uuid(),kind:z.enum(['map','property'])}).parse(d)).handler(async({data,context})=>{
  const {data:org,error}=await context.supabase.rpc('current_org');if(error || !org)throw new Error('Agenția nu este disponibilă.');
  const {isAiFeatureEnabled}=await import('@/lib/ai/features/features.server');
  if(!await isAiFeatureEnabled(org,'ai_crm'))return null;
  const {data:admin,error:roleError}=await context.supabase.rpc('is_org_admin');if(roleError)throw new Error('Accesul nu a putut fi verificat.');
  const {findPropertyDuplicates}=await import('./property-duplicates.server');
  return findPropertyDuplicates(context.supabase,org,admin===true?null:context.userId,data.kind,data.id);
});