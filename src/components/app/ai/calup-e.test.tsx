// @vitest-environment jsdom
import { act } from 'react';import { createRoot } from 'react-dom/client';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { describe,it,expect,vi,afterEach } from 'vitest';
const m=vi.hoisted(()=>({enabled:true,approach:vi.fn(),duplicates:vi.fn(),check:vi.fn(),status:vi.fn(),insight:vi.fn()}));
vi.mock('@/hooks/use-ai-features',()=>({useAiFeatures:()=>({isEnabled:()=>m.enabled})}));
vi.mock('@tanstack/react-start',()=>({useServerFn:(fn:unknown)=>fn}));
vi.mock('@/lib/prospecting/enrichment.functions',()=>({generateOwnerApproach:m.approach,findPossiblePropertyDuplicates:m.duplicates}));
vi.mock('@/lib/contracts/check.functions',()=>({checkContractBeforeSigning:m.check}));
vi.mock('@/lib/ai/agents/manager/agency-insights.functions',()=>({agencyInsightsStatus:m.status,getAgencyInsight:m.insight}));
import { OwnerApproachDraft } from './OwnerApproachDraft';
import { PossibleDuplicatesPanel } from './PossibleDuplicatesPanel';
import { ContractCheckPanel } from '@/components/app/contracts/ContractCheckPanel';
import { AgencyInsightsPanel } from '@/components/app/ai-bubble/AgencyInsightsPanel';
import { AgencyAnswerContent } from './AgencyAnswerContent';
const roots:ReturnType<typeof createRoot>[]=[];
async function mount(node:React.ReactNode){(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;const el=document.createElement('div');document.body.appendChild(el);const root=createRoot(el);roots.push(root);await act(async()=>{root.render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{node}</QueryClientProvider>);await new Promise(r=>setTimeout(r,20));});await act(async()=>{await new Promise(r=>setTimeout(r,20));});return el;}
async function click(el:HTMLElement,text:string){const button=[...el.querySelectorAll('button')].find(b=>b.textContent?.includes(text));if(!button)throw new Error('Control absent');await act(async()=>{button.click();await new Promise(r=>setTimeout(r,30));});}
afterEach(async()=>{for(const root of roots.splice(0))await act(async()=>root.unmount());document.body.innerHTML='';m.enabled=true;vi.clearAllMocks();});
describe('calup E — ciorne și citiri fără acțiuni automate',()=>{
  it('fără AI activat, funcțiile nu apar și nu fac citiri',async()=>{
    m.enabled=false;const el=await mount(<><OwnerApproachDraft id="x" kind="map"/><PossibleDuplicatesPanel id="x" kind="map"/><ContractCheckPanel id="x"/><AgencyInsightsPanel/></>);
    expect(el.childElementCount).toBe(0);expect(m.approach).not.toHaveBeenCalled();expect(m.duplicates).not.toHaveBeenCalled();expect(m.check).not.toHaveBeenCalled();expect(m.status).not.toHaveBeenCalled();
  });
  it.each(['map','argus'] as const)('mesajul %s rămâne ciornă editabilă, fără trimitere',async kind=>{
    m.approach.mockResolvedValue({ok:true,text:'Bună ziua, discutăm despre anunț?'});const el=await mount(<OwnerApproachDraft id="x" kind={kind}/>);expect(m.approach).not.toHaveBeenCalled();await click(el,'Mesaj de abordare');expect(el.querySelector('textarea')?.value).toBe('Bună ziua, discutăm despre anunț?');expect(m.approach).toHaveBeenCalledWith({data:{id:'x',kind}});expect(el.querySelector('a')).toBeNull();
  });
  it('duplicatele afișează încredere și motive, fără control de unire/ștergere',async()=>{
    m.duplicates.mockResolvedValue({photoNotice:'Date disponibile',matches:[{offer:{id:'b',title:'Ofertă',source:'MAP',href:null},confidence:'high',score:75,reasons:['Același etaj']}]});const el=await mount(<PossibleDuplicatesPanel id="x" kind="map"/>);await click(el,'Caută posibile duplicate');expect(el.textContent).toContain('75%');expect(el.textContent).toContain('Același etaj');expect(el.querySelectorAll('button')).toHaveLength(1);
  });
  it('verificarea contractului afișează nepotriviri, fără scriere sau semnare',async()=>{
    m.check.mockResolvedValue({checked:2,issues:[{field:'price',kind:'mismatch',source:'proprietate',message:'Preț: nu corespunde.'}]});const el=await mount(<ContractCheckPanel id="x"/>);expect(m.check).not.toHaveBeenCalled();await click(el,'Verifică înainte de semnare');expect(el.textContent).toContain('Preț: nu corespunde.');expect(el.querySelectorAll('button')).toHaveLength(1);
  });
  it('bula nu arată întrebările dacă serverul nu confirmă agency_admin',async()=>{
    m.status.mockResolvedValue({allowed:false});const el=await mount(<AgencyInsightsPanel/>);expect(el.childElementCount).toBe(0);expect(m.insight).not.toHaveBeenCalled();
  });
  it('răspunsul invalid nu strică pagina sau completează ciorna',async()=>{
    m.approach.mockResolvedValue({ok:false,message:'Ciorna invalidă.'});const el=await mount(<OwnerApproachDraft id="x" kind="map"/>);await click(el,'Mesaj de abordare');expect(el.querySelector('[role=alert]')).not.toBeNull();expect(el.querySelector('textarea')).toBeNull();
  });
  it('răspunsurile de management au numai linkuri interne validate',async()=>{
    const el=await mount(<AgencyAnswerContent content={'- [Anunț](/app/properties/22222222-2222-4222-8222-222222222222)\n- [Extern](javascript:alert(1))'}/>);
    expect(el.querySelectorAll('a')).toHaveLength(1);expect(el.querySelector('a')?.getAttribute('href')).toBe('/app/properties/22222222-2222-4222-8222-222222222222');
  });
});