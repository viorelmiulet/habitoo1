import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireActiveOrgAuth} from '@/lib/org-access';

export const startDevelopmentUnitOperation = createServerFn({method:'POST'})
 .middleware([requireActiveOrgAuth])
 .inputValidator((input:unknown)=>z.object({developmentId:z.string().uuid(),propertyIds:z.array(z.string().uuid()).min(1).max(200),operation:z.enum(['withdraw','republish','remove'])}).parse(input))
 .handler(async({data,context})=>{
  const {data:id,error}=await context.supabase.rpc('start_development_unit_operation',{_development_id:data.developmentId,_property_ids:data.propertyIds,_operation:data.operation});
  if(error)throw new Error(error.message);
  return {jobId:id};
 });