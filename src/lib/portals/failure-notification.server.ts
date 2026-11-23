/** Existing bell notifications, reconciled transactionally with publication state. */
type NotificationAdmin={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{error:unknown}>};
export async function notifyPortalFailure(admin:NotificationAdmin,input:{organizationId:string;propertyId:string;portalKey:string;portalName:string;error:string;code?:string|null;httpStatus?:number|null;operation?:string}):Promise<void>{
 const {error}=await admin.rpc('record_portal_alert',{_org:input.organizationId,_property:input.propertyId,_portal:input.portalKey,_operation:input.operation??'publish',_success:false,_message:input.error,_code:input.code??null,_http:input.httpStatus??null,_name:input.portalName});if(error)throw error;
}
