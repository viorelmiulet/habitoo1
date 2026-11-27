import {clonePortalIds} from './clone';
import type {PortalDefinition} from '@/lib/portals/registry';
import {z} from 'zod';

export const developmentPortalChangesSchema=z.array(z.object({
 portalKey:z.string().regex(/^[a-z0-9][a-z0-9_-]{0,99}$/),enabled:z.boolean(),
})).min(1).max(50).refine(changes=>new Set(changes.map(c=>c.portalKey)).size===changes.length,'Un portal poate apărea o singură dată.');
export type DevelopmentPortalChange={portal_key:string;enabled:boolean};

export type DevelopmentPortalSelection={development_id:string;portal_key:string;enabled:boolean};
/** Storia uses the developer account; dynamic Partner portals share the feed registry. */
export function eligibleDevelopmentPortalIds(activated:Set<string>,definitions:PortalDefinition[]) {
 return clonePortalIds(new Set([...activated,'storia']),definitions);
}
export function selectedDevelopmentPortalIds(selections:DevelopmentPortalSelection[],developmentId:string,eligible:string[]) {
 return [...new Set(selections.filter(s=>s.development_id===developmentId&&s.enabled&&eligible.includes(s.portal_key)).map(s=>s.portal_key))];
}
export function developmentSelectedForPortal(selections:DevelopmentPortalSelection[],developmentId:string,portal:string) {
 return selections.some(s=>s.development_id===developmentId&&s.portal_key===portal&&s.enabled);
}/** Portals an agent may enable: admin allow-list intersected with agency eligibility; null = unrestricted (admin/superadmin). */
export function agentAllowedDevelopmentPortals(eligible:string[],allowed:string[]|null):string[]|null{return allowed===null?null:eligible.filter(id=>allowed.includes(id));}
/** First enabling change outside the actor's allow-list; disabling is always permitted. */
export function forbiddenDevelopmentPortal(changes:{portalKey:string;enabled:boolean}[],allowed:string[]|null):string|null{
 if(allowed===null)return null;return changes.find(c=>c.enabled&&!allowed.includes(c.portalKey))?.portalKey??null;
}
export const DEVELOPMENT_PORTAL_NOT_ALLOWED='Nepermis de administrator';
export const DEVELOPMENT_CREATE_NOT_ALLOWED='Administratorul agenției nu ți-a dat dreptul să creezi ansambluri.';
