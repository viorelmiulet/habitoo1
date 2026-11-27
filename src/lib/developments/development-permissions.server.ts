type Db=(typeof import('@/integrations/supabase/client.server'))['supabaseAdmin'];
export type ActorDevelopmentPermissions={unrestricted:boolean;canCreate:boolean;allowedPortals:string[]|null};
/** Caller-RLS read of the acting user's development rights; admins and superadmins are unrestricted. */
export async function readActorDevelopmentPermissions(db:Db,userId:string,organizationId:string):Promise<ActorDevelopmentPermissions>{
 const [{data:superadmin,error:e1},{data:admin,error:e2}]=await Promise.all([db.rpc('is_superadmin'),db.rpc('has_role',{_user_id:userId,_role:'agency_admin'})]);
 if(e1)throw e1;if(e2)throw e2;
 if(superadmin===true||admin===true)return {unrestricted:true,canCreate:true,allowedPortals:null};
 const {data,error}=await db.from('agent_development_permissions').select('can_create,allowed_portals').eq('organization_id',organizationId).eq('user_id',userId).maybeSingle();
 if(error)throw error;
 return {unrestricted:false,canCreate:data?.can_create===true,allowedPortals:data?.allowed_portals??[]};
}
