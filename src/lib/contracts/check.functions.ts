import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireActiveOrgAuth } from '@/lib/org-access';
export const checkContractBeforeSigning=createServerFn({method:'POST'}).middleware([requireActiveOrgAuth]).inputValidator((d:unknown)=>z.object({id:z.string().uuid()}).parse(d)).handler(async({data,context})=>{
  const {data:c,error}=await context.supabase.from('contracts').select('*').eq('id',data.id).maybeSingle();
  if(error || !c)throw new Error('Contractul nu este accesibil.');
  const {data:admin,error:roleError}=await context.supabase.rpc('is_org_admin');
  if(roleError || (admin!==true && c.assigned_to!==context.userId && c.created_by!==context.userId))throw new Error('Contractul nu este accesibil.');
  const {isAiFeatureEnabled}=await import('@/lib/ai/features/features.server');
  if(!await isAiFeatureEnabled(c.organization_id,'ai_crm'))return null;
  const {checkContractSources}=await import('./check.server');
  return checkContractSources(context.supabase,c);
});