import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingTourProvider } from "./OnboardingTour";
import { GUIDE_CONTEXT_EVENT } from "@/lib/onboarding-tour";
import type { CurrentUser } from "@/hooks/use-session";

const mock = vi.hoisted(() => ({ path: "/app/properties/abc", records: new Map<string, string>(), auto: true, claims: [] as string[], mutations: 0 }));
vi.mock("@tanstack/react-router", () => ({ useLocation: () => ({ pathname: mock.path }), useNavigate: () => vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/hooks/use-ai-features", () => ({ useAiFeatures: () => ({ features: {} }) }));
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
