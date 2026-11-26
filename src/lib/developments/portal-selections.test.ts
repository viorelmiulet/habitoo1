import {it,expect} from 'vitest';
import {eligibleDevelopmentPortalIds,selectedDevelopmentPortalIds,developmentSelectedForPortal,developmentPortalChangesSchema} from './portal-selections';
import {allPortals} from '@/lib/portals/registry';
import {dynamicPortalDefinition} from '@/lib/dynamic-feed-portals';
it('eligibilitatea include Storia dezvoltator, feed-uri activate și Partner API, fără push sau portaluri inactive',()=>{
 const partner=dynamicPortalDefinition({slug:'cauta',display_name:'cauta.ro',key_prefix:'hbca_',website:'https://example.test',logo_path:null,xml_enabled:false,active:true,show_public:false,integration_mode:'api'});
 const ids=eligibleDevelopmentPortalIds(new Set(['cauta','clickimob','imobiliare_ro']),[...allPortals(),partner]);
 expect(ids).toContain('storia');expect(ids).toContain('clickimob');expect(ids).toContain('cauta');expect(ids).not.toContain('imobiliare_ro');expect(ids).not.toContain('imobli');
});
it('preselecția este intersecția portalurilor eligibile și bifate, fără fallback la toate feed-urile',()=>{
 const s=[{development_id:'d',portal_key:'storia',enabled:false},{development_id:'d',portal_key:'clickimob',enabled:true},{development_id:'other',portal_key:'cauta',enabled:true}];
 expect(selectedDevelopmentPortalIds(s,'d',['storia','clickimob','cauta'])).toEqual(['clickimob']);
 expect(selectedDevelopmentPortalIds([],'new',['storia','clickimob'])).toEqual([]);
 expect(developmentSelectedForPortal(s,'d','storia')).toBe(false);
});
it.each([true,false])('mvaimobiliare este eligibil și moștenit de copii numai când este activat (%s)',activated=>{
 const eligible=eligibleDevelopmentPortalIds(new Set(activated?['mvaimobiliare','lacheie']:['lacheie']),allPortals());
 expect(eligible.includes('mvaimobiliare')).toBe(activated);
 expect(eligible).not.toContain('lacheie');
 const selections=[{development_id:'d',portal_key:'mvaimobiliare',enabled:true},{development_id:'d',portal_key:'lacheie',enabled:true}];
 expect(selectedDevelopmentPortalIds(selections,'d',eligible)).toEqual(activated?['mvaimobiliare']:[]);
});
it('modificările sunt între 1 și 50, fără duplicate, cu ID-uri dinamice permise',()=>{
 expect(developmentPortalChangesSchema.safeParse([]).success).toBe(false);
 expect(developmentPortalChangesSchema.safeParse([{portalKey:'propri-ro',enabled:true}]).success).toBe(true);
 expect(developmentPortalChangesSchema.safeParse([{portalKey:'storia',enabled:true},{portalKey:'storia',enabled:false}]).success).toBe(false);
 expect(developmentPortalChangesSchema.safeParse(Array.from({length:50},(_,i)=>({portalKey:`p-${i}`,enabled:true}))).success).toBe(true);
 expect(developmentPortalChangesSchema.safeParse(Array.from({length:51},(_,i)=>({portalKey:`p-${i}`,enabled:true}))).success).toBe(false);
});