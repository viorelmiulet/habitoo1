import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireActiveOrgAuth } from '@/lib/org-access';

export const getListingPriceEstimate=createServerFn({method:'POST'}).middleware([requireActiveOrgAuth]).inputValidator((d:unknown)=>z.object({propertyId:z.string().uuid()}).parse(d)).handler(async({data,context})=>{
  const {data:org,error}=await context.supabase.rpc('current_org');
  if(error || !org)throw new Error('Agenția nu este disponibilă.');
  const {isAiFeatureEnabled}=await import('@/lib/ai/features/features.server');
  if(!await isAiFeatureEnabled(org,'acp_ai'))return null;
  const {data:allowed}=await context.supabase.rpc('can_see_property_reports',{_property:data.propertyId});
  if(!allowed)throw new Error('Nu ai acces la acest anunț.');
  const {data:admin,error:roleError}=await context.supabase.rpc('is_org_admin');
  if(roleError)throw new Error('Accesul nu a putut fi verificat.');
  const {loadPriceEstimate}=await import('./price.server');
  return loadPriceEstimate(context.supabase,org,data.propertyId,admin===true?undefined:context.userId);
});