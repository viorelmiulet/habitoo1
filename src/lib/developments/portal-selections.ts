import {clonePortalIds} from './clone';
import type {PortalDefinition} from '@/lib/portals/registry';

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
}