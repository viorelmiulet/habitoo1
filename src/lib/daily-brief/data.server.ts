import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { actionAgentScope, buildHomeActions, selectActions, type ActionData } from './actions';
import { checkListing } from '@/lib/listing-check/rules';
export async function completeRows<T>(query:(a:number,b:number)=>PromiseLike<{data:T[]|null;error:{message:string}|null}>):Promise<T[]> {
 const out:T[]=[];for(let a=0;;a+=500){const r=await query(a,a+499);if(r.error)throw new Error('Acțiunile nu au putut fi încărcate.');out.push(...r.data??[]);if((r.data?.length??0)<500)return out;}
}
export async function loadDailyBrief(db:SupabaseClient<Database>,organizationId:string,userId:string,now=new Date(),agentId?:string):Promise<ActionData> {
 const admin=await db.rpc('is_org_admin');if(admin.error)throw new Error('Accesul nu a putut fi verificat.');
 const scope=actionAgentScope(userId,admin.data===true,agentId);
 const profiles=admin.data===true?await completeRows((a,b)=>db.from('profiles').select('id,full_name').eq('organization_id',organizationId).eq('is_active',true).order('id').range(a,b)):[];
 if(scope && admin.data===true && !profiles.some(p=>p.id===scope))throw new Error('Agentul nu aparține agenției.');
 const scoped=(q:any)=>scope?q.eq('assigned_to',scope):q;
 const [leads,requests,activities,events,properties,matches,listings,contracts,proposals,images,preferences]=await Promise.all([
  completeRows((a,b)=>scoped(db.from('leads').select('id,stage,source,created_at,last_interaction_at,next_followup_at,assigned_to,contact_id,property_id,request_id').eq('organization_id',organizationId).is('deleted_at',null)).order('id').range(a,b)),
  completeRows((a,b)=>scoped(db.from('requests').select('id,title,status,source,created_at,assigned_to,contact_id').eq('organization_id',organizationId).eq('status','active')).order('id').range(a,b)),
  completeRows((a,b)=>db.from('activities').select('id,title,kind,starts_at,done,status,updated_at,assigned_to,lead_id,request_id,contact_id,property_id').eq('organization_id',organizationId).neq('status','cancelled').order('id').range(a,b)),
  completeRows((a,b)=>db.from('lead_events').select('lead_id,created_at,actor_id').eq('organization_id',organizationId).order('id').range(a,b)),
  completeRows((a,b)=>scoped(db.from('properties').select('*').eq('organization_id',organizationId).eq('status','active').is('deleted_at',null).is('archived_at',null)).order('id').range(a,b)),
  completeRows((a,b)=>{let q=db.from('active_match_alerts').select('id,property_id,request_id,score,created_at,agent_id,status,sent_at').eq('organization_id',organizationId).eq('status','new').is('sent_at',null);if(scope)q=q.eq('agent_id',scope);return q.order('id').range(a,b);}),
  completeRows((a,b)=>db.from('portal_listings').select('property_id,status,published_at').eq('organization_id',organizationId).order('id').range(a,b)),
  completeRows((a,b)=>scoped(db.from('contracts').select('id,title,kind,status,sent_at,signed_at,duration_days,assigned_to').eq('organization_id',organizationId)).order('id').range(a,b)),
  completeRows((a,b)=>db.from('collaboration_proposals').select('id,property_id,status,created_at').eq('owner_organization_id',organizationId).neq('requester_organization_id',organizationId).eq('status','pending').order('id').range(a,b)),
  completeRows((a,b)=>db.from('property_images').select('property_id,is_primary,is_confidential,include_in_publish,storage_path,source_url,url').eq('organization_id',organizationId).order('id').range(a,b)),
  completeRows((a,b)=>db.from('home_action_preferences').select('action_key,ignored,snoozed_until').eq('user_id',userId).eq('organization_id',organizationId).order('action_key').range(a,b)),
 ]);
 const cities=[...new Set((properties as any[]).map(p=>p.city).filter(Boolean))] as string[];
 const map:any[]=[];for(let i=0;i<cities.length;i+=100)map.push(...await completeRows((a,b)=>db.from('listings').select('id,title,city,zone,is_owner,first_seen_at,source').in('city',cities.slice(i,i+100)).eq('is_owner',true).neq('source','facebook').gte('first_seen_at',new Date(now.getTime()-86400000).toISOString()).order('id').range(a,b)));
 const checks:{propertyId:string;issues:ReturnType<typeof checkListing>['issues']}[]=[];
 const ps=properties as Database['public']['Tables']['properties']['Row'][];
 // Shared listing rules; portal-specific failures/requirements deliberately never enter Home.
 for(const p of ps){const result=checkListing({property:p,images:images.filter(x=>x.property_id===p.id).map(x=>({isPrimary:x.is_primary===true,isConfidential:x.is_confidential===true,includeInPublish:x.include_in_publish===true,storagePath:x.storage_path,sourceUrl:x.source_url,url:x.url})),publications:[],portalReports:[],zoneMedianPerSqm:null,duplicateDescription:false});checks.push({propertyId:p.id,issues:result.issues});}
 const actions=buildHomeActions({now,scope,leads,requests,activities,events,properties,matches,listings,contracts,proposals,checks,map});
 return {version:2,actions:selectActions(actions,preferences,now),computedAt:now.toISOString(),agents:profiles.map(p=>({id:p.id,name:p.full_name})),isAdmin:admin.data===true};
}
