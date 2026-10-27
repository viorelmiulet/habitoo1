import { describe, expect, it } from "vitest";
import { GUIDE_IDS, SAFE_SHOW_SELECTORS, accessibleGuides, guideProgressSummary, guideForPath, guidePathMatches, guidesForContext, implementedGuides, stepsForUser } from "./onboarding-tour";
import { plannedGuides } from "./onboarding-catalog";
import { emptyAiFeatureMap, type AiFeatureMap } from "./ai/features/keys";

const allFeatures: AiFeatureMap = { ...emptyAiFeatureMap(), ai_marketing: true, ai_media: true };

describe("potrivirea căilor și a contextelor", () => {
  it("segmentul :id se potrivește cu orice valoare, dar nu cu alte adâncimi", () => {
    expect(guidePathMatches("/app/properties/:id", "/app/properties/abc-123")).toBe(true);
    expect(guidePathMatches("/app/properties/:id", "/app/properties")).toBe(false);
    expect(guidePathMatches("/app/properties/:id", "/app/properties/abc/extra")).toBe(false);
  });
  it("pagina de adăugare rămâne pe ghidul ei, nu pe cel de detaliu", () => {
    expect(guideForPath("/app/properties/new")?.id).toBe("property-create");
    expect(guideForPath("/app/properties/abc")?.id).toBe("property-detail");
  });
  it("ghidurile contextuale se găsesc pe filă, în ordinea declarată", () => {
    expect(guidesForContext("/app/properties/abc", "property-tab:media").map((g) => g.id)).toEqual(["property-media"]);
    expect(guidesForContext("/app/properties/abc", "property-tab:publishing").map((g) => g.id)).toEqual(["property-publishing", "property-promotions"]);
    expect(guidesForContext("/app/properties/abc", "property-tab:leads").map((g) => g.id)).toEqual(["property-leads"]);
    expect(guidesForContext("/app/properties/abc", "property:editing").map((g) => g.id)).toEqual(["property-edit"]);
    expect(guidesForContext("/app/collaboration", "property-tab:media")).toEqual([]);
  });
});

describe("pașii filtrați pe rol și funcții AI", () => {
  const detail = implementedGuides.find((g) => g.id === "property-detail");
  if (!detail) throw new Error("Ghid proprietate lipsă");
  it("agentul nu vede pasul de reasignare, adminul îl vede", () => {
    expect(stepsForUser(detail, "agent", allFeatures).some((s) => s.id === "reassign")).toBe(false);
    expect(stepsForUser(detail, "agency_admin", allFeatures).some((s) => s.id === "reassign")).toBe(true);
  });
  it("pasul Studio AI din Poze apare doar cu funcția activată", () => {
    const media = implementedGuides.find((g) => g.id === "property-media");
    if (!media) throw new Error("Ghid Poze lipsă");
    expect(stepsForUser(media, "agent", emptyAiFeatureMap()).some((s) => s.id === "ai")).toBe(false);
    expect(stepsForUser(media, "agent", allFeatures).some((s) => s.id === "ai")).toBe(true);
  });
  it("ghidul Marketing AI nu e deloc disponibil fără funcție", () => {
    expect(accessibleGuides(implementedGuides, "agent", emptyAiFeatureMap()).some((g) => g.id === "property-marketing")).toBe(false);
    expect(accessibleGuides(implementedGuides, "agent", allFeatures).some((g) => g.id === "property-marketing")).toBe(true);
  });
  it("niciun ghid nu depășește 8 pași pentru niciun rol", () => {
    for (const guide of implementedGuides) {
      for (const role of ["agent", "agency_admin", "superadmin"] as const) {
        expect(stepsForUser(guide, role, allFeatures).length, `${guide.id}/${role}`).toBeLessThanOrEqual(8);
      }
    }
  });
});

describe("inventarul reorganizat", () => {
  it("în jur de 40 de ghiduri pentru agent și admin (implementate + planificate)", () => {
    const implementedAgency = implementedGuides.filter((g) => g.roles.includes("agent")).length;
    const plannedAgency = plannedGuides.filter((g) => g.roles.includes("agent")).length;
    const total = implementedAgency + plannedAgency;
    expect(total).toBeGreaterThanOrEqual(38);
    expect(total).toBeLessThanOrEqual(52);
  });
  it("nu există ghiduri exclusiv SuperAdmin în inventar", () => {
    expect(plannedGuides.filter(g=>g.roles.length===1&&g.roles[0]==='superadmin')).toEqual([]);
    expect(implementedGuides.filter(g=>g.roles.length===1&&g.roles[0]==='superadmin')).toEqual([]);
  });
  it("inventarul nu repetă ghidurile deja implementate", () => {
    const done = new Set(implementedGuides.map((g) => g.id));
    expect(plannedGuides.some((g) => done.has(g.id))).toBe(false);
  });
});

describe("etapa 3 — reguli de acces, pornire și siguranță", () => {
  const ids = ["contacts-list", "contact-detail", "contact-create", "requests-list", "request-detail", "leads-list", "contracts-list", "contract-detail", "activities", "calendar", "matching", "notifications", "clipurile-mele", "support"];
  it("toate cele 14 ghiduri sunt înregistrate pentru progresul existent", () => {
    expect(implementedGuides.filter((g) => ids.includes(g.id))).toHaveLength(14);
    for (const id of ids) expect(GUIDE_IDS).toContain(id);
  });
  it("contactul nou pornește la deschiderea ferestrei, nu la simpla vizită a listei", () => {
    expect(guideForPath("/app/contacts")?.id).toBe("contacts-list");
    expect(guidesForContext("/app/contacts", "contact:creating").map((g) => g.id)).toEqual(["contact-create"]);
    expect(guidesForContext("/app/requests", "contact:creating")).toEqual([]);
  });
  it("atribuirea lead-ului este explicată doar administratorului", () => {
    const guide = implementedGuides.find((g) => g.id === "leads-list");
    if (!guide) throw Error("Ghid lipsă");
    expect(stepsForUser(guide, "agent", allFeatures).some((s) => s.id === "agent")).toBe(false);
    expect(stepsForUser(guide, "agency_admin", allFeatures).some((s) => s.id === "agent")).toBe(true);
  });
  it("elementele absente se sar, fără pași interactivi pe acțiuni finale", () => {
    const forbidden = /save|send|delete|pdf|done|stage|drag|submit|sign/;
    for (const guide of implementedGuides.filter((g) => ids.includes(g.id))) {
      for (const step of guide.steps) {
        if (step.selector) expect(step.optional).toBe(true);
        if (step.mode === "do") expect(step.selector).not.toMatch(forbidden);
        if (step.show) {
          expect(Object.keys(SAFE_SHOW_SELECTORS)).toContain(step.show);
          expect(SAFE_SHOW_SELECTORS[step.show as keyof typeof SAFE_SHOW_SELECTORS]).not.toMatch(forbidden);
        }
      }
    }
  });
  it("etapa 4 înlocuiește intrările planificate fără duplicate", () => {
    const required = ["acp-new", "acp-saved", "acp-detail", "habitoo-ai", "agent-chat", "topbar-tools"];
    for (const id of required) {
      expect(plannedGuides.some(g=>g.id===id)).toBe(false);
      expect(implementedGuides.filter(g=>g.id===id)).toHaveLength(1);
    }
  });
});

describe('etapa 4 — siguranță și acces',()=>{
 const ids=['anunturi-particulari','anunturi-particulari-detail','anunturi-import','acp-new','acp-saved','acp-detail','ai-crm','ai-marketing','ai-media','ai-manager','habitoo-ai','agent-chat','topbar-tools'];
 it('înregistrează exact cele 13 ghiduri',()=>{for(const id of ids)expect(GUIDE_IDS).toContain(id);expect(implementedGuides.filter(g=>ids.includes(g.id))).toHaveLength(13);});
 it('toate cele cinci ghiduri AI cer funcția proprie',()=>{for(const id of ['ai-crm','ai-marketing','ai-media','ai-manager','habitoo-ai'])expect(accessibleGuides(implementedGuides,'agent',emptyAiFeatureMap()).some(g=>g.id===id)).toBe(false);});
 it('explicația ACP AI dispare fără activare',()=>{const g=implementedGuides.find(g=>g.id==='acp-detail');if(!g)throw Error('missing');expect(stepsForUser(g,'agent',emptyAiFeatureMap()).some(s=>s.id==='ai')).toBe(false);expect(stepsForUser(g,'agent',{...emptyAiFeatureMap(),acp_ai:true}).some(s=>s.id==='ai')).toBe(true);});
 it('contextele ferestrelor funcționează pe orice pagină CRM',()=>{expect(guidesForContext('/app/anunturi-particulari/abc','listing:import').map(g=>g.id)).toEqual(['anunturi-import']);expect(guidesForContext('/app/properties','chat:directory').map(g=>g.id)).toEqual(['agent-chat']);expect(guidesForContext('/app/ai','topbar:tools').map(g=>g.id)).toEqual(['topbar-tools']);expect(guidesForContext('/superadmin','chat:directory')).toEqual([]);});
 it('niciun pas interactiv nu execută acțiuni finale sau AI',()=>{const forbidden=/generate|submit|create|rerun|approve|send|import-open|chat-contact|pdf|save/;for(const g of implementedGuides.filter(g=>ids.includes(g.id)))for(const s of g.steps){if(s.mode==='do')expect(s.selector).not.toMatch(forbidden);if(s.show){expect(SAFE_SHOW_SELECTORS[s.show as keyof typeof SAFE_SHOW_SELECTORS]).not.toMatch(forbidden);}}});
});

describe('etapa 5 — inventar final și progres per rol', () => {
 const ids = ['team','team-member','comisioane','reports','goals','settings','settings-integrations','abonament'];
 it('toate cele opt ghiduri sunt disponibile, fără planificate', () => {
  expect(plannedGuides).toEqual([]);
  expect(implementedGuides.filter(g => ids.includes(g.id))).toHaveLength(8);
  for(const id of ids) expect(GUIDE_IDS).toContain(id);
  expect(new Set(implementedGuides.map(g=>g.id)).size).toBe(50);
 });
 it('agentul vede doar Comisioane și Setări; adminul vede toate cele opt', () => {
  expect(accessibleGuides(implementedGuides,'agent',emptyAiFeatureMap()).filter(g=>ids.includes(g.id)).map(g=>g.id)).toEqual(['comisioane','settings']);
  expect(accessibleGuides(implementedGuides,'agency_admin',emptyAiFeatureMap()).filter(g=>ids.includes(g.id))).toHaveLength(8);
 });
 it('numără doar finalizările distincte accesibile: agent 38 și admin 44 fără AI', () => {
  const progress=[...implementedGuides.map(g=>({guide_id:g.id,status:'completed'})),{guide_id:'team',status:'completed'},{guide_id:'removed',status:'completed'}];
  expect(guideProgressSummary(accessibleGuides(implementedGuides,'agent',emptyAiFeatureMap()),progress)).toEqual({completed:38,total:38});
  expect(guideProgressSummary(accessibleGuides(implementedGuides,'agency_admin',emptyAiFeatureMap()),progress)).toEqual({completed:44,total:44});
 });
 it('cu toate funcțiile AI agentul are 44 și adminul 50; văzut/sărit nu înseamnă finalizat', () => {
  const enabled=Object.fromEntries(Object.keys(emptyAiFeatureMap()).map(k=>[k,true])) as AiFeatureMap;
  expect(guideProgressSummary(accessibleGuides(implementedGuides,'agent',enabled),[{guide_id:'settings',status:'seen'},{guide_id:'comisioane',status:'skipped'}])).toEqual({completed:0,total:44});
  expect(accessibleGuides(implementedGuides,'agency_admin',enabled)).toHaveLength(50);
 });
 it('setările urmează fila deschisă din URL sau din meniu', () => {
  expect(guidesForContext('/app/settings','settings:profile').map(g=>g.id)).toEqual(['settings']);
  for(const key of ['portals','integrations','promotion'])expect(guidesForContext('/app/settings',`settings:${key}`).map(g=>g.id)).toEqual(['settings-integrations']);
 });
 it('maximum 8 pași și fără acțiuni finale automate', () => {
  for(const g of implementedGuides.filter(g=>ids.includes(g.id))) {
   expect(g.steps.length).toBeLessThanOrEqual(8);
   for(const s of g.steps) if(s.mode==='do'||s.mode==='show') {
    expect(s.selector).not.toMatch(/save|submit|delete|toggle|upload|approve|disconnect|test-connection|manual-progress/);
    if(s.show)expect(SAFE_SHOW_SELECTORS[s.show as keyof typeof SAFE_SHOW_SELECTORS]).toBe(s.selector);
   }
  }
 });
});
