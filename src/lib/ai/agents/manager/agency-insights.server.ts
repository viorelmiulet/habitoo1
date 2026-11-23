import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { readComplete } from '@/lib/owner-reports/price.server';
import { type AgencyQuery,type AgencyInsight } from './agency-insights';
export async function readAgencyInsight(db:SupabaseClient<Database>,org:string,query:AgencyQuery,now=new Date()):Promise<AgencyInsight>{
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const {romaniaMidnightUtc}=await import('@/lib/owner-reports/report');
  const since=romaniaMidnightUtc(`${date.slice(0,7)}-01`);
  if(query==='properties_without_leads'){
    const [properties,leads]=await Promise.all([
      readComplete((a,b)=>db.from('properties').select('id,title').eq('organization_id',org).eq('status','active').is('deleted_at',null).is('archived_at',null).order('id').range(a,b)),
      readComplete((a,b)=>db.from('leads').select('property_id').eq('organization_id',org).is('deleted_at',null).gte('created_at',since).lte('created_at',now.toISOString()).order('id').range(a,b))
    ]);
    const seen=new Set(leads.map(l=>l.property_id));
    return {title:'Anunțuri fără lead-uri luna aceasta',period:`${since} – ${now.toISOString()}`,items:properties.filter(p=>!seen.has(p.id)).map(p=>({id:p.id,label:p.title,href:`/app/properties/${p.id}`}))};
  }
  if(query!=='untouched_leads')throw new Error('Interogarea nu este disponibilă.');
  const [leads,events,activities,profiles]=await Promise.all([
    readComplete((a,b)=>db.from('leads').select('id,assigned_to,created_at,last_interaction_at,contact_id').eq('organization_id',org).eq('stage','new').is('deleted_at',null).order('id').range(a,b)),
    readComplete((a,b)=>db.from('lead_events').select('lead_id,actor_id,created_at').eq('organization_id',org).order('id').range(a,b)),
    readComplete((a,b)=>db.from('activities').select('lead_id,contact_id,created_at').eq('organization_id',org).eq('status','done').in('kind',['call','email','meeting']).order('id').range(a,b)),
    readComplete((a,b)=>db.from('profiles').select('id,full_name').eq('organization_id',org).eq('is_active',true).order('id').range(a,b))
  ]);
  const uncontacted=leads.filter(l=>!(l.last_interaction_at && l.last_interaction_at>l.created_at) && !events.some(e=>e.lead_id===l.id && e.actor_id && e.created_at>l.created_at) && !activities.some(a=>(a.lead_id===l.id || (l.contact_id && a.contact_id===l.contact_id)) && a.created_at>l.created_at));
  return {title:'Agenți cu lead-uri neatinse',period:now.toISOString(),items:profiles.flatMap(p=>{const owned=uncontacted.filter(l=>l.assigned_to===p.id);return owned.map((l,i)=>({id:l.id,label:`${p.full_name} · lead neatins ${i+1} din ${owned.length}`,href:`/app/leads?lead=${encodeURIComponent(l.id)}`}));})};
}