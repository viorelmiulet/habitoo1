import { briefDate } from './brief';
import type { CheckIssue } from '@/lib/listing-check/rules';
export const ACTION_ORDER = ['new_lead','overdue','viewing','match','portal_message','required','old_listing','owner','contract','collaboration','map'] as const;
export type ActionKind = typeof ACTION_ORDER[number];
export type HomeAction = { id: string; kind: ActionKind; entityKey: string; title: string; reason: string; to: string; search?: Record<string,string>; button: string; at: string; source: string | null; propertyTitle: string | null; ageHours: number; agentId: string | null };
export type Preference = { action_key: string; ignored: boolean; snoozed_until: string | null };
export type ActionData = { version: 2; actions: HomeAction[]; computedAt: string; agents: { id: string; name: string }[]; isAdmin: boolean };
const DAY = 86400000;
export function actionAgentScope(userId: string, isAdmin: boolean, requested?: string): string | null {
 if (!isAdmin && requested && requested !== userId) throw new Error('Nu ai acces la acțiunile altui agent.');
 return isAdmin ? requested ?? null : userId;
}
export function selectActions(actions: HomeAction[], preferences: Preference[], now: Date): HomeAction[] {
 const prefs = new Map(preferences.map(p => [p.action_key,p]));
 const seen = new Set<string>();
 return [...actions].sort((a,b) => ACTION_ORDER.indexOf(a.kind)-ACTION_ORDER.indexOf(b.kind) || a.at.localeCompare(b.at) || a.id.localeCompare(b.id)).filter(a => {
  const p = prefs.get(a.id);
  if (p?.ignored || (p?.snoozed_until && Date.parse(p.snoozed_until)>now.getTime()) || seen.has(a.entityKey)) return false;
  seen.add(a.entityKey); return true;
 });
}
export function applyAiOrder(actions: HomeAction[], raw: unknown): { actions: HomeAction[]; recommendation: string | null } {
 if (!raw || typeof raw !== 'object') return { actions,recommendation:null };
 const r = raw as { ids?: unknown; recommendation?: unknown };
 if (!Array.isArray(r.ids) || !r.ids.every(id => typeof id==='string') || typeof r.recommendation!=='string' || r.recommendation.length>300) return { actions,recommendation:null };
 const ids = r.ids as string[];
 const allowed = new Map(actions.map(a => [a.id,a]));
 if (ids.length!==actions.length || new Set(ids).size!==ids.length || ids.some(id => !allowed.has(id))) return { actions,recommendation:null };
 return { actions: ids.flatMap(id => {const a=allowed.get(id);return a?[a]:[];}), recommendation:r.recommendation.trim() || null };
}
/** No client name, phone, owner, internal note, or free-text reason is sent to AI. */
export function aiActionFacts(actions: HomeAction[]) { return actions.map((a,i) => ({ id:String(i),type:a.kind,ageHours:a.ageHours,source:a.source,propertyTitle:a.propertyTitle })); }
export function buildHomeActions(input: {
 now: Date; scope: string | null;
 leads: any[]; requests: any[]; activities: any[]; events: any[]; properties: any[]; matches: any[]; checks: {propertyId:string;issues:CheckIssue[]}[]; listings: any[]; contracts: any[]; proposals: any[]; map: any[];
}): HomeAction[] {
 const out: HomeAction[]=[]; const now=input.now.getTime(); const day=briefDate(input.now); const tomorrow=briefDate(new Date(now+DAY));
 const owned=(a:any)=>input.scope===null || a.assigned_to===input.scope;
 const props=new Map(input.properties.filter(owned).map(p=>[p.id,p]));
 const add=(kind:ActionKind,key:string,title:string,reason:string,to:string,at:string,agentId:string|null,button:string,options: {search?:Record<string,string>;source?:string|null;propertyTitle?:string|null;entityKey?:string}={})=>out.push({id:`${kind}:${key}`,kind,entityKey:options.entityKey??`${kind}:${key}`,title,reason,to,at,agentId,button,source:options.source??null,propertyTitle:options.propertyTitle??null,ageHours:Math.max(0,(now-Date.parse(at))/3600000),...(options.search?{search:options.search}:{})});
 const touch=(id:string,received:string,contactId?:string|null)=>input.activities.some(a=>(a.lead_id===id || a.request_id===id || (contactId && a.contact_id===contactId)) && (a.done || ['call','message','note'].includes(a.kind)) && Date.parse(a.updated_at)>Date.parse(received)) || input.events.some(e=>e.lead_id===id && e.actor_id && e.created_at>received);
 for (const l of input.leads.filter(owned)) {
  if (['won','lost','archived'].includes(l.stage)) continue;
  const elapsed=(now-Date.parse(l.created_at))/3600000;
  if(l.stage==='new' && elapsed>2 && !(l.last_interaction_at && l.last_interaction_at>=l.created_at) && !touch(l.id,l.created_at,l.contact_id)) add('new_lead',l.id,'Contactează lead-ul',`Lead${l.source?` de pe ${l.source}`:''}, primit acum ${Math.floor(elapsed)} h, necontactat`,'/app/leads',l.created_at,l.assigned_to,'Deschide lead',{search:{lead:l.id},source:l.source,entityKey:`lead:${l.id}`});
  if(l.next_followup_at && Date.parse(l.next_followup_at)<now) add('overdue',`lead-${l.id}`,'Follow-up restant','Termenul de revenire a fost depășit.','/app/leads',l.next_followup_at,l.assigned_to,'Deschide lead',{search:{lead:l.id},entityKey:`lead:${l.id}`});
 }
 for(const r of input.requests.filter(owned)) if(r.status==='active' && now-Date.parse(r.created_at)>2*3600000 && !input.leads.some(l=>l.request_id===r.id) && !touch(r.id,r.created_at,r.contact_id)) add('new_lead',`request-${r.id}`,'Contactează cererea nouă',`Cerere${r.source?` de pe ${r.source}`:''}, necontactată de peste 2 h.`,`/app/requests/${r.id}`,r.created_at,r.assigned_to,'Deschide cererea',{source:r.source});
 for(const a of input.activities.filter(owned)) {
  if(a.done || a.status==='cancelled') continue;
  const date=briefDate(new Date(a.starts_at));
  if(a.kind==='viewing' && [day,tomorrow].includes(date) && Date.parse(a.starts_at)>=now) add('viewing',a.id,a.title,`Vizionare ${date===day?'azi':'mâine'}, ${new Date(a.starts_at).toLocaleTimeString('ro-RO',{timeZone:'Europe/Bucharest',hour:'2-digit',minute:'2-digit'})}.`,'/app/activities',a.starts_at,a.assigned_to,'Deschide vizionarea',{search:{q:a.title},...(a.property_id?{entityKey:`property:${a.property_id}`}:{})});
  // This module has no structured viewing feedback, so absence of a description is not treated as absence of feedback.
  else if(a.kind!=='viewing' && Date.parse(a.starts_at)<now) add('overdue',a.id,a.title,'Activitate programată, depășită și neînchisă.','/app/activities',a.starts_at,a.assigned_to,'Deschide activitatea',{search:{q:a.title}});
 }
 for(const m of input.matches) if(!m.sent_at && m.status==='new' && (input.scope===null || m.agent_id===input.scope) && input.requests.some(r=>r.id===m.request_id && owned(r))) add('match',m.id,'Trimite potrivirea nouă',`Proprietate potrivită (${m.score}%), netrimisă.`,`/app/requests/${m.request_id}`,m.created_at,m.agent_id,'Deschide cererea',{...(props.has(m.property_id)?{propertyTitle:props.get(m.property_id).title}:{}),entityKey:`property:${m.property_id}`});
 for(const c of input.checks) {
  const p=props.get(c.propertyId);if(!p)continue;
  const issues=c.issues.filter(i=>i.severity==='required' && i.code!=='unpublished_with_portals' && !i.code.startsWith('portal_'));
  if(issues.length) add('required',p.id,p.title,issues.map(i=>i.message).join(' · '),`/app/properties/${p.id}`,p.created_at,p.assigned_to,'Deschide anunț',{search:{tab:issues[0]?.tab??'overview'},propertyTitle:p.title,entityKey:`property:${p.id}`});
 }
 for(const p of props.values()) {
  const published=input.listings.filter(l=>l.property_id===p.id && ['published','in_feed'].includes(l.status) && l.published_at).map(l=>l.published_at).sort()[0];
  if(p.publish_status==='published' && published && now-Date.parse(published)>45*DAY && now-Date.parse(p.updated_at)>45*DAY && !input.leads.some(l=>l.property_id===p.id)) add('old_listing',p.id,p.title,'Publicat de peste 45 de zile, fără lead-uri și fără modificări.',`/app/properties/${p.id}`,published,p.assigned_to,'Deschide anunț',{propertyTitle:p.title,entityKey:`property:${p.id}`});
  if(p.status==='active' && p.owner_contact_id && now-Date.parse(p.created_at)>30*DAY && !input.activities.some(a=>a.contact_id===p.owner_contact_id && a.done && Date.parse(a.updated_at)>=now-30*DAY)) add('owner',p.id,p.title,'Activ de peste 30 de zile; fără activitate cu proprietarul în ultimele 30 de zile.',`/app/properties/${p.id}`,p.created_at,p.assigned_to,'Deschide anunț',{propertyTitle:p.title,entityKey:`property:${p.id}`});
 }
 for(const c of input.contracts.filter(owned)) {
  if(['cancelled','void','archived'].includes(c.status))continue;
  if(c.sent_at && !c.signed_at) add('contract',c.id,c.title,'Contract trimis, dar încă nesemnat.',`/app/contracts/${c.id}`,c.sent_at,c.assigned_to,'Deschide contract');
  else if(c.kind==='exclusive_representation' && c.signed_at && c.duration_days) {
   const end=Date.parse(c.signed_at)+c.duration_days*DAY;
   if(end>=now && end<=now+14*DAY) add('contract',c.id,c.title,`Exclusivitatea expiră în ${Math.ceil((end-now)/DAY)} zile.`,`/app/contracts/${c.id}`,new Date(end).toISOString(),c.assigned_to,'Deschide contract');
  }
 }
 for(const c of input.proposals) { const p=props.get(c.property_id);if(p && c.status==='pending') add('collaboration',c.id,'Răspunde colaboratorului','Propunere de la altă agenție, fără răspuns.','/app/collaboration',c.created_at,p.assigned_to,'Deschide colaborarea',{propertyTitle:p.title,entityKey:`property:${p.id}`}); }
 const cities=new Set([...props.values()].map(p=>p.city).filter(Boolean));
 const zones=new Set([...props.values()].map(p=>`${p.city}:${p.district}`).filter(Boolean));
 for(const l of input.map) if(l.is_owner===true && l.source!=='facebook' && now-Date.parse(l.first_seen_at)<=DAY && (cities.has(l.city)||zones.has(`${l.city}:${l.zone}`))) add('map',l.id,l.title??'Anunț particular nou',`Anunț particular nou în ${[l.city,l.zone].filter(Boolean).join(', ')}.`,`/app/anunturi-particulari/${l.id}`,l.first_seen_at,input.scope,'Deschide anunț',{source:l.source,propertyTitle:l.title});
 return out;
}
