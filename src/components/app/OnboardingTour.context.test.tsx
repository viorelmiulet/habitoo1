import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingTourProvider } from "./OnboardingTour";
import { GUIDE_CONTEXT_EVENT, implementedGuides } from "@/lib/onboarding-tour";
import type { CurrentUser } from "@/hooks/use-session";

const mock = vi.hoisted(() => ({ path: "/app/properties/abc", records: new Map<string, string>(), auto: true, claims: [] as string[], mutations: 0 }));
vi.mock("@tanstack/react-router", () => ({ useLocation: () => ({ pathname: mock.path }), useNavigate: () => vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/hooks/use-ai-features", () => ({ useAiFeatures: () => ({ features: {ai_crm:true,ai_marketing:true,ai_media:true,ai_manager:true,ai_assistant:true,acp_ai:true} }) }));
vi.mock("@/lib/onboarding.functions", () => ({
  getGuideProgress: async () => ({ autoStart: mock.auto, progress: [...mock.records].map(([guide_id, status]) => ({ guide_id, status })) }),
  claimGuide: async ({ data }: { data: { guideId: string } }) => { mock.claims.push(data.guideId); if (!mock.auto || mock.records.has(data.guideId)) return false; mock.records.set(data.guideId, "seen"); return true; },
  finishGuide: async ({ data }: { data: { guideId: string; completed: boolean } }) => { mock.records.set(data.guideId, data.completed ? "completed" : "skipped"); return { ok: true }; },
  setGuideAutoStart: async () => ({ ok: true }),
}));
vi.mock("@/components/ui/dialog", () => ({ Dialog: ({ children, open }: any) => open ? children : null, DialogContent: ({ children }: any) => <div>{children}</div>, DialogHeader: ({ children }: any) => <div>{children}</div>, DialogTitle: ({ children }: any) => <h2>{children}</h2>, DialogDescription: ({ children }: any) => <p>{children}</p> }));

const wait = async (ms = 900) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
const announce = (key: string) => act(async () => { window.dispatchEvent(new CustomEvent(GUIDE_CONTEXT_EVENT, { detail: key })); });
function click(text: string) { const button = [...document.querySelectorAll("button")].find((b) => b.textContent === text); if (!button) throw Error("missing " + text); button.click(); }

afterEach(() => { document.body.innerHTML = ""; vi.unstubAllGlobals(); });

describe("ghiduri contextuale pe pagina proprietății", () => {
  it("fila Poze pornește ghidul ei o singură dată; Publicare îl înlănțuie pe cel de promovări; nimic nu se salvează", async () => {
    mock.records.clear(); mock.claims = []; mock.auto = true; mock.path = "/app/properties/abc";
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    window.scrollBy = vi.fn();
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const user = { userId: "agent", role: "agent", profile: { id: "agent" }, impersonation: null } as unknown as CurrentUser;
    const draw = async () => act(async () => root.render(
      <QueryClientProvider client={client}>
        <OnboardingTourProvider user={user} openMenu={() => {}} closeMenu={() => {}}>
          <div data-tour="media-upload">upload</div>
          <button data-tour="publishing-publish" onClick={() => mock.mutations++}>Publică</button>
        </OnboardingTourProvider>
      </QueryClientProvider>,
    ));
    await draw(); await wait(); await wait(300);
    // La deschiderea proprietății pornește ghidul de detaliu (cale cu :id).
    expect(document.querySelector("[data-guide]")?.getAttribute("data-guide")).toBe("property-detail");
    await act(async () => click("Sari peste")); await wait(100);
    // Deschiderea filei Poze pornește ghidul filei.
    await announce("property-tab:media"); await wait(); await wait(300);
    expect(document.querySelector("[data-guide]")?.getAttribute("data-guide")).toBe("property-media");
    await act(async () => click("Sari peste")); await wait(100);
    // Același context nu repornește ghidul.
    await announce("property-tab:media"); await wait(); await wait(300);
    expect(document.querySelector("[data-guide]")).toBeNull();
    // Fila Publicare pornește ghidul de publicare, apoi automat pe cel de promovări.
    await announce("property-tab:publishing"); await wait(); await wait(300);
    expect(document.querySelector("[data-guide]")?.getAttribute("data-guide")).toBe("property-publishing");
    await act(async () => click("Sari peste")); await wait(); await wait(300);
    expect(document.querySelector("[data-guide]")?.getAttribute("data-guide")).toBe("property-promotions");
    await act(async () => click("Sari peste")); await wait(100);
    expect(mock.claims).toEqual(["property-detail", "property-media", "property-publishing", "property-promotions"]);
    expect(mock.mutations).toBe(0);
    await act(async () => root.unmount()); client.clear();
  });

  it("ghidul Colaborare pornește la prima deschidere a paginii", async () => {
    mock.records.clear(); mock.claims = []; mock.auto = true; mock.path = "/app/collaboration";
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    window.scrollBy = vi.fn();
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const user = { userId: "admin", role: "agency_admin", profile: { id: "admin" }, impersonation: null } as unknown as CurrentUser;
    await act(async () => root.render(
      <QueryClientProvider client={client}>
        <OnboardingTourProvider user={user} openMenu={() => {}} closeMenu={() => {}}>
          <div data-tour="collab-filters">filtre</div>
        </OnboardingTourProvider>
      </QueryClientProvider>,
    ));
    await wait(); await wait(300);
    expect(document.querySelector("[data-guide]")?.getAttribute("data-guide")).toBe("collaboration");
    await act(async () => click("Sari peste")); await wait(100);
    await act(async () => root.unmount()); client.clear();
  });
});


describe("étape 3: chaque guide, agent/admin et desktop/téléphone", () => {
  const ids = ["contacts-list", "contact-detail", "contact-create", "requests-list", "request-detail", "leads-list", "contracts-list", "contract-detail", "activities", "calendar", "matching", "notifications", "clipurile-mele", "support"];
  it.each(ids)("%s ne démarre qu’une fois et ne touche aucune action finale", async (id) => {
    const guide = implementedGuides.find((g) => g.id === id);
    if (!guide) throw Error("missing guide");
    for (const [role, width] of [["agent",1280],["agency_admin",1280],["agent",390],["agency_admin",390]] as const) {
      mock.records.clear(); mock.claims=[]; mock.auto=true; mock.path=guide.path.replace(":id", "existing-record");
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
      vi.stubGlobal("ResizeObserver",class{observe(){}disconnect(){}});
      window.scrollBy=vi.fn(); Object.defineProperty(window,"innerWidth",{value:width,configurable:true});
      const host=document.createElement("div"); document.body.append(host);
      const root=createRoot(host); const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
      const user={userId:role,role,profile:{id:role},impersonation:null} as unknown as CurrentUser;
      const before=mock.mutations;
      await act(async()=>root.render(<QueryClientProvider client={client}><OnboardingTourProvider user={user} openMenu={()=>{}} closeMenu={()=>{}}><button data-tour="contract-send" onClick={()=>mock.mutations++}>Trimite</button><button data-tour="contact-create-save" onClick={()=>mock.mutations++}>Salvează</button><button onClick={()=>mock.mutations++}>Șterge</button></OnboardingTourProvider></QueryClientProvider>));
      if (guide.context) { await wait(750); if(document.querySelector("[data-guide]")) await act(async()=>click("Sari peste")); await announce(String(guide.context)); }
      await wait(750); await wait(100);
      expect(document.querySelector("[data-guide]")?.getAttribute("data-guide")).toBe(id);
      if(width===390) expect((document.querySelector("[data-guide]") as HTMLElement).style.bottom).toBe("12px");
      await act(async()=>click("Sari peste")); await wait(750);
      expect(document.querySelector("[data-guide]")).toBeNull();
      expect(mock.claims.filter((g)=>g===id)).toHaveLength(1);
      expect(mock.mutations).toBe(before);
      await act(async()=>root.unmount()); client.clear();host.remove();
    }
  });
});

describe("etapa 4: motorul parcurge toate etapele fără acțiuni finale",()=>{
 const ids=['anunturi-particulari','anunturi-particulari-detail','anunturi-import','acp-new','acp-saved','acp-detail','ai-crm','ai-marketing','ai-media','ai-manager','habitoo-ai','agent-chat','topbar-tools'];
 it.each(ids)("%s desktop și telefon fără mutații",async(id)=>{
  const guide=implementedGuides.find(g=>g.id===id);if(!guide)throw Error('missing');
  for(const width of [1280,390]){
   mock.records.clear();mock.claims=[];mock.auto=true;mock.path=guide.path==='/app/*'?'/app':guide.path.replace(':id','existing-record');
   vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});window.scrollBy=vi.fn();Object.defineProperty(window,'innerWidth',{value:width,configurable:true});
   const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});const user={userId:'agent',role:'agent',profile:{id:'agent'},impersonation:null} as unknown as CurrentUser;
   await act(async()=>root.render(<QueryClientProvider client={client}><OnboardingTourProvider user={user} openMenu={()=>{}} closeMenu={()=>{}}><button data-tour="studio-generate" onClick={()=>mock.mutations++}>Generează</button><button data-tour="acp-create" onClick={()=>mock.mutations++}>Analizează</button><button onClick={()=>mock.mutations++}>Da</button></OnboardingTourProvider></QueryClientProvider>));
   await wait(750);if(guide.context){if(document.querySelector('[data-guide]'))await act(async()=>click('Sari peste'));await announce(String(guide.context));await wait(750);}
   expect(document.querySelector('[data-guide]')?.getAttribute('data-guide')).toBe(id);
   const before=mock.mutations;
   for(let n=0;n<20&&document.querySelector(`[data-guide="${id}"]`);n++){
    const card=document.querySelector(`[data-guide="${id}"]`);const buttons=[...(card?.querySelectorAll('button')??[])];const button=buttons.find(b=>['Arată-mi','Sari pasul','Înainte','Am înțeles'].includes(b.textContent??''));if(button)await act(async()=>button.click());await wait(20);
   }
   expect(mock.mutations).toBe(before);expect(mock.records.get(id)).toBe('completed');await wait(750);expect(mock.claims.filter(g=>g===id)).toHaveLength(1);await act(async()=>root.unmount());client.clear();host.remove();
  }
 });
});

describe('etapa 5: fiecare ghid pe desktop/telefon și agent/admin', () => {
 const ids=['team','team-member','comisioane','reports','goals','settings','settings-integrations','abonament'];
 it.each(ids)('%s respectă accesul și nu execută mutații',async(id)=>{
  const guide=implementedGuides.find(g=>g.id===id);if(!guide)throw Error('missing');
  for(const role of ['agent','agency_admin'] as const)for(const width of [1280,390]){
   mock.records.clear();mock.claims=[];mock.auto=true;mock.path=guide.path.replace(':id','existing-record');
   vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});window.scrollBy=vi.fn();Object.defineProperty(window,'innerWidth',{value:width,configurable:true});
   const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
   const user={userId:role,role,profile:{id:role},impersonation:null} as unknown as CurrentUser;
   const before=mock.mutations;
   await act(async()=>root.render(<QueryClientProvider client={client}><OnboardingTourProvider user={user} openMenu={()=>{}} closeMenu={()=>{}}><button onClick={()=>mock.mutations++}>Salvează</button><button onClick={()=>mock.mutations++}>Trimite</button><button onClick={()=>mock.mutations++}>Șterge</button></OnboardingTourProvider></QueryClientProvider>));
   await wait(750);if(guide.context){await announce(Array.isArray(guide.context)?guide.context[0]:guide.context);await wait(750);}
   if(guide.roles.includes(role)){
    expect(document.querySelector('[data-guide]')?.getAttribute('data-guide')).toBe(id);
    if(width===390)expect((document.querySelector('[data-guide]') as HTMLElement).style.bottom).toBe('12px');
    for(let n=0;n<24&&document.querySelector(`[data-guide="${id}"]`);n++){
     const card=document.querySelector(`[data-guide="${id}"]`);const b=[...(card?.querySelectorAll('button')??[])].find(b=>['Arată-mi','Sari pasul','Înainte','Am înțeles'].includes(b.textContent??''));if(b)await act(async()=>b.click());await wait(20);
    }
    expect(mock.records.get(id)).toBe('completed');await wait(750);expect(mock.claims.filter(g=>g===id)).toHaveLength(1);
   }else {expect(document.querySelector('[data-guide]')).toBeNull();expect(mock.claims).toEqual([]);}
   expect(mock.mutations).toBe(before);await act(async()=>root.unmount());client.clear();host.remove();
  }
 });
});
