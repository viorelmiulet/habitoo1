// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,it,expect,vi} from 'vitest';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {DevelopmentPublishing} from './DevelopmentPublishing';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
const mocks=vi.hoisted(()=>({result:{connected:false,publication:null,units:[],missingFields:[] as string[]},send:vi.fn()}));
vi.mock('@tanstack/react-start',()=>({useServerFn:(f:unknown)=>f}));
vi.mock('@/lib/portals/storia/development.functions',()=>({getDevelopmentPublishing:async()=>mocks.result,requestDevelopmentPublishing:mocks.send}));
vi.mock('@/lib/developments/portal-selections.functions',()=>({getDevelopmentPortalSelections:async()=>({portals:[{id:'storia',name:'Storia'}],selections:[],job:null}),getDevelopmentPortalStates:async()=>({portals:[]}),setDevelopmentPortalSelections:vi.fn()}));
beforeEach(()=>{mocks.result={connected:false,publication:null,units:[],missingFields:[]};vi.clearAllMocks();});
async function renderPublishing(check:(c:HTMLDivElement)=>void){
 const c=document.createElement('div');document.body.append(c);const root=createRoot(c);const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});
 try{
  await act(async()=>{root.render(<QueryClientProvider client={qc}><DevelopmentPublishing id="d" editable/></QueryClientProvider>);});
  await act(async()=>{await new Promise(r=>setTimeout(r,30));});
  check(c);
 }finally{await act(async()=>root.unmount());c.remove();qc.clear();}
}
it('cu contul agenției singur butonul investiției este dezactivat',async()=>{
 await renderPublishing(c=>{const b=[...c.querySelectorAll('button')].find(b=>b.textContent==='Publică pe Storia');expect(b?.disabled).toBe(true);expect(c.textContent).toContain('contul agenției nu poate publica ansambluri');});
});
it('afișează toate lipsurile și nota fără să blocheze butonul de publicare',async()=>{
 mocks.result.connected=true;
 mocks.result.missingFields=['Descriere','Suprafață minimă (m²)','Suprafață maximă (m²)','Preț minim pe m²'];
 await renderPublishing(c=>{expect(c.textContent).toContain('Storia va refuza ansamblul până completezi: Descriere, Suprafață minimă (m²), Suprafață maximă (m²), Preț minim pe m².');expect(c.textContent).toContain('Fără descriere și fotografie, unele portaluri nu afișează pagina ansamblului.');expect([...c.querySelectorAll('button')].find(b=>b.textContent==='Publică pe Storia')?.disabled).toBe(false);expect(mocks.send).not.toHaveBeenCalled();});
});
it('nota apare și când lipsește numai fotografia',async()=>{
 mocks.result.missingFields=['Fotografie'];
 await renderPublishing(c=>expect(c.textContent).toContain('Fără descriere și fotografie, unele portaluri nu afișează pagina ansamblului.'));
});
it('ansamblul complet nu afișează avertismente',async()=>{
 await renderPublishing(c=>{expect(c.textContent).not.toContain('Storia va refuza');expect(c.textContent).not.toContain('Fără descriere și fotografie');});
});