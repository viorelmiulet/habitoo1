/** Existing bell notifications, reconciled transactionally with publication state. */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
type NotificationAdmin = Pick<SupabaseClient<Database>, 'rpc'>;
export async function notifyPortalFailure(admin:NotificationAdmin,input:{organizationId:string;propertyId:string;portalKey:string;portalName:string;error:string;code?:string|null;httpStatus?:number|null;operation?:string}):Promise<void>{
 const {error}=await admin.rpc('record_portal_alert',{_org:input.organizationId,_property:input.propertyId,_portal:input.portalKey,_operation:input.operation??'publish',_success:false,_message:input.error,...(input.code!=null?{_code:input.code}:{}),...(input.httpStatus!=null?{_http:input.httpStatus}:{}),_name:input.portalName});if(error)throw error;
}
