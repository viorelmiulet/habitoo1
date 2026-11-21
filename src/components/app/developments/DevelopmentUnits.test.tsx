// @vitest-environment jsdom
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {Development} from '@/lib/developments';

const mocked=vi.hoisted(()=>({start:vi.fn(async()=>({jobId:'job'})),page:0}));
vi.mock('@tanstack/react-start',async importOriginal=>({...await importOriginal<typeof import('@tanstack/react-start')>(),useServerFn:(fn:unknown)=>fn}));
vi.mock('@/lib/developments/unit-operations.functions',()=>({startDevelopmentUnitOperation:mocked.start}));
vi.mock('@/lib/developments/clone.functions',()=>({startDevelopmentClone:vi.fn()}));
vi.mock('@tanstack/react-router',()=>({Link:({children}:{children:React.ReactNode})=><a>{children}</a>}));
vi.mock('@/components/app/property-list/ListCompleteness',()=>({useCompletenessExtras:()=>()=>({}),ListCompletenessCell:()=>null}));
vi.mock('./LastCloneJob',()=>({LastCloneJob:()=>null}));
vi.mock('./LastUnitOperation',()=>({LastUnitOperation:()=>null}));
vi.mock('@/components/ui/sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:(table:string)=>{
 const query={select:()=>query,eq:()=>query,is:()=>query,order:()=>query,range:(start:number)=>{mocked.page=start/24;return query;},in:()=>query,
  then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(resolve({error:null,data:table==='properties'?Array.from({length:24},(_,i)=>({id:`copy-${mocked.page*24+i}`,reference:`HB-${mocked.page*24+i}`,title:`Unitate ${i}`,cloned_from_property_id:'original',status:'active',development_withdrawn_at:i===0?'2026-11-21T14:00:00Z':null})):[]}))};
 return query;
}}}));
import {DevelopmentUnits} from './DevelopmentUnits';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
const dev={id:'development',organization_id:'org'} as Development;
let root:Root;let el:HTMLDivElement;let client:QueryClient;
async function settle(){await act(async()=>{await new Promise(r=>setTimeout(r,15));});}
async function mount(editable=true){await act(async()=>root.render(<QueryClientProvider client={client}><DevelopmentUnits development={dev} editable={editable}/></QueryClientProvider>));await settle();}
async function clickLabel(label:string){const button=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.getAttribute('aria-label')===label||b.textContent?.trim()===label);if(!button)throw new Error(`Missing ${label}`);await act(async()=>button.click());await settle();}
beforeEach(()=>{mocked.start.mockClear();mocked.page=0;el=document.createElement('div');document.body.appendChild(el);root=createRoot(el);client=new QueryClient({defaultOptions:{queries:{retry:false}}});});
afterEach(async()=>{await act(async()=>root.unmount());el.remove();client.clear();});
it('selectează doar pagina curentă și pornește retragerea pentru copiile selectate',async()=>{
 await mount();await clickLabel('Selectează tot');await clickLabel('Retrage de pe portaluri');
 expect(mocked.start).toHaveBeenCalledExactlyOnceWith({data:{developmentId:'development',propertyIds:Array.from({length:24},(_,i)=>`copy-${i}`),operation:'withdraw'}});
 await clickLabel('Mai multe');await clickLabel('Selectează tot');await clickLabel('Retrage de pe portaluri');
 expect(mocked.start).toHaveBeenLastCalledWith({data:{developmentId:'development',propertyIds:Array.from({length:24},(_,i)=>`copy-${i+24}`),operation:'withdraw'}});
});
it('republică selecția care conține o copie retrasă',async()=>{
 await mount();await clickLabel('Selectează HB-0');await clickLabel('Republică');
 expect(mocked.start).toHaveBeenCalledExactlyOnceWith({data:{developmentId:'development',propertyIds:['copy-0'],operation:'republish'}});
});
it('confirmarea scoaterii transmite numai copiile bifate',async()=>{
 await mount();await clickLabel('Selectează HB-1');await clickLabel('Selectează HB-2');
 const bulk=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()==='Scoate din ansamblu');if(!bulk)throw new Error('Missing bulk remove');await act(async()=>bulk.click());await settle();
 expect(mocked.start).not.toHaveBeenCalled();await clickLabel('Confirmă');
 expect(mocked.start).toHaveBeenCalledExactlyOnceWith({data:{developmentId:'development',propertyIds:['copy-1','copy-2'],operation:'remove'}});
});
it('iconița individuală pornește același job pentru o singură copie',async()=>{
 await mount();const icon=document.querySelector<HTMLButtonElement>('button[aria-label="Scoate din ansamblu"]');if(!icon)throw new Error('Missing icon');await act(async()=>icon.click());await settle();await clickLabel('Confirmă');
 expect(mocked.start).toHaveBeenCalledExactlyOnceWith({data:{developmentId:'development',propertyIds:['copy-0'],operation:'remove'}});
});
it('accesul numai pentru citire nu permite selectarea sau pornirea operațiilor',async()=>{
 await mount(false);expect(document.querySelectorAll('button[role="checkbox"]')).toHaveLength(0);expect(mocked.start).not.toHaveBeenCalled();
});