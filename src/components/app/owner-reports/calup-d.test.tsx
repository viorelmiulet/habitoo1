// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { afterEach,describe,expect,it,vi } from 'vitest';
const m=vi.hoisted(()=>({enabled:true,get:vi.fn(),panel:vi.fn(),generate:vi.fn(),send:vi.fn(),links:vi.fn(),skip:vi.fn(),save:vi.fn(),wa:vi.fn()}));
vi.mock('@/hooks/use-ai-features',()=>({useAiFeatures:()=>({isEnabled:()=>m.enabled})}));
vi.mock('@tanstack/react-start',()=>({useServerFn:(fn:unknown)=>fn}));
vi.mock('@/lib/owner-reports/price.functions',()=>({getListingPriceEstimate:m.get}));
vi.mock('@/lib/owner-reports/owner-reports.functions',()=>({getOwnerReportPanel:m.panel,generateOwnerReportNow:m.generate,sendOwnerReportNow:m.send,getOwnerReportLinks:m.links,skipOwnerReport:m.skip,saveOwnerReportSettings:m.save,markOwnerReportSentWhatsapp:m.wa}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
import { PriceEstimatePanel } from './PriceEstimatePanel';
import { OwnerReportsHistory } from './OwnerReportsPanel';
const roots:ReturnType<typeof createRoot>[]=[];
async function mount(node:React.ReactNode){
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const el=document.createElement('div');document.body.appendChild(el);const root=createRoot(el);roots.push(root);
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  await act(async()=>{root.render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);await new Promise(r=>setTimeout(r,30));});
  await act(async()=>{await new Promise(r=>setTimeout(r,30));});return el;
}
afterEach(async()=>{for(const r of roots.splice(0))await act(async()=>r.unmount());document.body.innerHTML='';vi.clearAllMocks();m.enabled=true;});
describe('calup D — aprobarea agentului',()=>{
  it('AI dezactivat nu oferă estimare sau raport',async()=>{
    m.enabled=false;m.panel.mockResolvedValue({allowed:false});
    const el=await mount(<><PriceEstimatePanel propertyId="p"/><OwnerReportsHistory propertyId="p"/></>);
    expect(el.childElementCount).toBe(0);expect(m.get).not.toHaveBeenCalled();expect(m.generate).not.toHaveBeenCalled();
  });
  it('sub 5 comparabile nu este randată nicio cifră de preț',async()=>{
    m.get.mockResolvedValue({status:'insufficient',comparables:[],criteria:['Suprafață între 75% și 125%']});
    const el=await mount(<PriceEstimatePanel propertyId="p"/>);expect(el.textContent).not.toMatch(/\d/);
    expect(el.querySelectorAll('li')).toHaveLength(0);
  });
  it('citirea nu generează și nu trimite; generarea explicită tot nu trimite',async()=>{
    m.panel.mockResolvedValue({allowed:true,hasOwner:true,enabled:false,reports:[]});m.generate.mockResolvedValue({ok:true,message:'gata'});
    const el=await mount(<OwnerReportsHistory propertyId="p"/>);
    expect(m.generate).not.toHaveBeenCalled();expect(m.send).not.toHaveBeenCalled();
    const button=[...el.querySelectorAll('button')].find(b=>b.textContent?.includes('Generează'));
    if(!button)throw new Error('Acțiunea lipsește');
    await act(async()=>{button.click();await new Promise(r=>setTimeout(r,30));});
    expect(m.generate).toHaveBeenCalledWith({data:{propertyId:'p'}});expect(m.send).not.toHaveBeenCalled();expect(m.links).not.toHaveBeenCalled();
  });
});