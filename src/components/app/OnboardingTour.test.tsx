import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingTourProvider } from "./OnboardingTour";
import type { CurrentUser } from "@/hooks/use-session";
const mock = vi.hoisted(() => ({ path: "/app", records: new Map<string,string>(), auto: true, claims: [] as string[], saves: 0 }));
vi.mock("@tanstack/react-router", () => ({ useLocation: () => ({ pathname: mock.path }), useNavigate: () => vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/hooks/use-ai-features", () => ({ useAiFeatures: () => ({ features: {} }) }));
vi.mock("@/lib/onboarding.functions", () => ({
 getGuideProgress: async () => ({ autoStart: mock.auto, progress: [...mock.records].map(([guide_id,status]) => ({guide_id,status})) }),
 claimGuide: async ({data}: {data:{guideId:string}}) => { mock.claims.push(data.guideId); if (!mock.auto || mock.records.has(data.guideId)) return false; mock.records.set(data.guideId,"seen"); return true; },
 finishGuide: async ({data}: {data:{guideId:string;completed:boolean}}) => { mock.records.set(data.guideId,data.completed?"completed":"skipped"); return {ok:true}; },
 setGuideAutoStart: async ({data}: {data:{enabled:boolean}}) => { mock.auto=data.enabled; return {ok:true}; },
}));
vi.mock("@/components/ui/dialog", () => ({ Dialog: ({children,open}:any) => open?children:null, DialogContent: ({children}:any) => <div>{children}</div>, DialogHeader: ({children}:any) => <div>{children}</div>, DialogTitle: ({children}:any) => <h2>{children}</h2>, DialogDescription: ({children}:any) => <p>{children}</p> }));
const wait = async (ms=900) => { await act(async () => { await new Promise(r=>setTimeout(r,ms)); }); };
function click(text:string) { const button=[...document.querySelectorAll('button')].find(b=>b.textContent===text); if(!button)throw Error('missing '+text); button.click(); }
afterEach(() => {document.body.innerHTML="";vi.unstubAllGlobals();});
describe("nou agent/admin, desktop/telefon", () => {
 it.each([["agent",1280],["agency_admin",1280],["agent",390],["agency_admin",390]] as const)("%s lățime %i: trei ghiduri o singură dată", async (role,width) => {
  mock.records.clear();mock.claims=[];mock.auto=true;mock.path="/app";
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
  vi.stubGlobal("ResizeObserver",class{observe(){}disconnect(){}});
  window.scrollBy=vi.fn();Object.defineProperty(window,"innerWidth",{value:width,configurable:true});
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
  const user={userId:role,role,profile:{id:role},impersonation:null} as unknown as CurrentUser;
  const draw=async()=>act(async()=>root.render(<QueryClientProvider client={client}><OnboardingTourProvider user={user} openMenu={()=>{}} closeMenu={()=>{}}><input id="title"/><button data-tour="new-save" onClick={()=>mock.saves++}>Salvează proprietatea</button></OnboardingTourProvider></QueryClientProvider>));
  for(const [path,id] of [["/app","first-steps"],["/app/properties","properties-list"],["/app/properties/new","property-create"]]){
   mock.path=path;await draw();await wait();await wait(300);
   expect(document.querySelector('[data-guide]')?.getAttribute('data-guide')).toBe(id);
   if(width===390) expect((document.querySelector('[data-guide]') as HTMLElement).style.bottom).toBe('12px');
   await act(async()=>click('Sari peste'));await wait(40);
   await draw();await wait();expect(document.querySelector('[data-guide]')).toBeNull();
  }
  expect(mock.claims).toEqual(['first-steps','properties-list','property-create']);expect(mock.saves).toBe(0);
  // A fresh device reads the same server-owned records; no autostart.
  await act(async()=>root.unmount());const second=createRoot(host);const secondClient=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
  await act(async()=>second.render(<QueryClientProvider client={secondClient}><OnboardingTourProvider user={user} openMenu={()=>{}} closeMenu={()=>{}}>Second device</OnboardingTourProvider></QueryClientProvider>));await wait();
  expect(document.querySelector('[data-guide]')).toBeNull();await act(async()=>second.unmount());client.clear();secondClient.clear();
 });
});
