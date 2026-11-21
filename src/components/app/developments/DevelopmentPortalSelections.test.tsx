// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {DevelopmentPortalSelections} from './DevelopmentPortalSelections';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
const save=vi.hoisted(()=>vi.fn(async()=>({ok:true})));
vi.mock('@tanstack/react-start',()=>({useServerFn:(f:unknown)=>f}));
vi.mock('@/lib/developments/portal-selections.functions',()=>({getDevelopmentPortalSelections:async()=>({portals:[{id:'storia',name:'Storia'},{id:'cauta',name:'cauta.ro'}],selections:[{portal_key:'cauta',enabled:true}],job:null}),setDevelopmentPortalSelection:save}));
vi.mock('@/components/ui/sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
it('trimite doar portalul și ansamblul ales, fără schimbarea altor portaluri',async()=>{
 const c=document.createElement('div');document.body.append(c);const root=createRoot(c);const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});
 await act(async()=>{root.render(<QueryClientProvider client={qc}><DevelopmentPortalSelections id="d" editable storiaConnected/></QueryClientProvider>);await new Promise(r=>setTimeout(r,30));});
 await act(async()=>{await new Promise(r=>setTimeout(r,50));});
 const checkbox=c.querySelector('[aria-label="cauta.ro"]');if(!(checkbox instanceof HTMLElement))throw new Error('Missing checkbox');
 await act(async()=>{checkbox.click();await new Promise(r=>setTimeout(r,30));});
 expect(save).toHaveBeenCalledWith({data:{id:'d',portalKey:'cauta',enabled:false}});
 await act(async()=>root.unmount());qc.clear();c.remove();
});