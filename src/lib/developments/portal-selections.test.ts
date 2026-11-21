import {it,expect} from 'vitest';
import {eligibleDevelopmentPortalIds,selectedDevelopmentPortalIds,developmentSelectedForPortal} from './portal-selections';
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