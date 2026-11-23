import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireActiveOrgAuth } from '@/lib/org-access';
import { AGENCY_QUERIES } from './agency-insights';
export const agencyInsightsStatus=createServerFn({method:'GET'}).middleware([requireActiveOrgAuth]).handler(async({context})=>{
  const {data:org}=await context.supabase.rpc('current_org');if(!org)return {allowed:false};
  const {data:role,error}=await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'agency_admin'});
  const {isAiFeatureEnabled}=await import('@/lib/ai/features/features.server');
  return {allowed:!error && role===true && await isAiFeatureEnabled(org,'ai_manager')};
});
export const getAgencyInsight=createServerFn({method:'POST'}).middleware([requireActiveOrgAuth]).inputValidator((d:unknown)=>z.object({query:z.enum(AGENCY_QUERIES)}).strict().parse(d)).handler(async({data,context})=>{
  const {data:org}=await context.supabase.rpc('current_org');if(!org)throw new Error('Agenția nu este disponibilă.');
  const {data:role,error}=await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'agency_admin'});
  if(error || role!==true)throw new Error('Disponibil doar administratorului agenției.');
  const {isAiFeatureEnabled}=await import('@/lib/ai/features/features.server');
  if(!await isAiFeatureEnabled(org,'ai_manager'))throw new Error('Funcția AI este dezactivată.');
  const {readAgencyInsight}=await import('./agency-insights.server');
  return readAgencyInsight(context.supabase,org,data.query);
});