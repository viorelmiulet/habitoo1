import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { PortalsCard } from "./PortalsCard";
import { AgencyPortalSetupPage } from "@/components/app/AgencyPortalSetupPage";

const state = vi.hoisted(() => ({ activated: true, admin: true, portalId: "homezz", hasCredential: true }));
vi.mock("@tanstack/react-start", async (original) => ({ ...await original<typeof import("@tanstack/react-start")>(), useServerFn: () => vi.fn() }));
vi.mock("@tanstack/react-router", async (original) => ({ ...await original<typeof import("@tanstack/react-router")>(), Link: ({ children }: { children: import("react").ReactNode }) => <a>{children}</a> }));
vi.mock("@/hooks/use-session", () => ({ useCurrentUser: () => ({ isLoading: false, data: { roles: state.admin ? ["agency_admin"] : ["agent"], organization: { id: "o1" } } }) }));
vi.mock("@/components/app/PortalSlotsCard", () => ({ PortalSlotsCard: ({ organizationId, portalId }: { organizationId?: string; portalId?: string }) => <section data-slots={portalId} data-org={organizationId} /> }));
vi.mock("@/components/app/ImobiliarePromotionsAdminCard", () => ({ ImobiliarePromotionsAdminCard: ({ organizationId, embedded }: { organizationId?: string; embedded?: boolean }) => <section data-imobiliare-promotions data-org={organizationId} data-embedded={String(embedded)} /> }));
vi.mock("@/components/app/ImopediaPackageBoostInfo", () => ({ ImopediaPackageBoostInfo: ({ organizationId }: { organizationId?: string }) => <section data-imopedia-package data-org={organizationId} /> }));
vi.mock("@/components/app/HomezzAgentsPanel", () => ({ HomezzAgentsPanel: () => <section data-homezz-agents /> }));
vi.mock("@/components/app/StoriaAccountControls", () => ({ StoriaAccountControls: () => null }));
vi.mock("@/components/app/PortalLogo", () => ({ PortalLogoStack: () => null }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const connection = { status: "connected", activated: state.activated, hasPortalCredential: state.hasCredential, externalAccountId: state.hasCredential ? "cont" : null };
    const portal = { id: state.portalId, status: "available", configuration_schema: { fields: [{ key: "credential", target: "credentials", label: "Cheie", secret: true }] }, capabilities: [], authentication: ["portal_api_key"], directions: [] };
    return { isLoading: false, isError: false, data: queryKey[0] === "portal-hub" ? [{ portal, connection, keys: [], feed: {}, listings: { published: 0, failed: 0 }, supportsConnectionTest: true }]
      : queryKey[0] === "agency-portal-setup" ? { id: state.portalId, displayName: state.portalId, connection, fields: portal.configuration_schema.fields, supportsConnectionTest: true, keys: [] }
      : queryKey[0] === "agency-portal-catalog" ? [] : undefined };
  },
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

beforeEach(() => {
  state.activated = true;
  state.admin = true;
  state.portalId = "homezz";
  state.hasCredential = true;
  window.sessionStorage.clear();
});

async function renderPortal(area: "superadmin" | "agency") {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  if (area === "superadmin") window.sessionStorage.setItem("habitoo:portals-selected:o1", state.portalId);
  await act(async () => root.render(area === "superadmin" ? <PortalsCard organizationId="o1" /> : <AgencyPortalSetupPage portalId={state.portalId} />));
  return { container, root };
}

async function cleanup(container: HTMLDivElement, root: ReturnType<typeof createRoot>) {
  await act(async () => root.unmount());
  container.remove();
}

it.each([true, false])("SuperAdmin: sloturi doar la portal activat=%s, după butoane și înainte de agenți", async (activated) => {
  state.activated = activated;
  const { container, root } = await renderPortal("superadmin");
  try {
    const slots = container.querySelector('[data-slots="homezz"]');
    expect(Boolean(slots)).toBe(activated);
    if (activated) {
      expect(slots?.getAttribute("data-org")).toBe("o1");
      const save = [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Salvează");
      const test = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Testează conexiunea"));
      expect(save?.compareDocumentPosition(slots as Node) ?? 0).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(test?.compareDocumentPosition(slots as Node) ?? 0).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(slots?.compareDocumentPosition(container.querySelector("[data-homezz-agents]") as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
  } finally { await cleanup(container, root); }
});

it.each([[true, true], [false, true], [true, false]])("agenție: activat=%s administrator=%s", async (activated, admin) => {
  state.activated = activated === true;
  state.admin = admin === true;
  const { container, root } = await renderPortal("agency");
  try {
    const slots = container.querySelector('[data-slots="homezz"]');
    expect(Boolean(slots)).toBe(activated && admin);
    if (slots) {
      const test = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Testează conexiunea"));
      expect(test?.compareDocumentPosition(slots)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(slots.compareDocumentPosition(container.querySelector("[data-homezz-agents]") as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
  } finally { await cleanup(container, root); }
});

it.each([true, false])("SuperAdmin: promovările Imobiliare.ro apar doar la activat=%s, încorporate și după sloturi", async (activated) => {
  state.portalId = "imobiliare_ro";
  state.activated = activated;
  const { container, root } = await renderPortal("superadmin");
  try {
    const promotions = container.querySelector("[data-imobiliare-promotions]");
    expect(Boolean(promotions)).toBe(activated);
    if (promotions) {
      expect(promotions.getAttribute("data-org")).toBe("o1");
      expect(promotions.getAttribute("data-embedded")).toBe("true");
      expect(container.querySelector('[data-slots="imobiliare_ro"]')?.compareDocumentPosition(promotions)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
  } finally { await cleanup(container, root); }
});

it.each([[true, true, true], [false, true, false], [true, false, false]])("agenție: Imobiliare.ro activat=%s administrator=%s → promovări=%s", async (activated, admin, expected) => {
  state.portalId = "imobiliare_ro";
  state.activated = activated === true;
  state.admin = admin === true;
  const { container, root } = await renderPortal("agency");
  try {
    const promotions = container.querySelector("[data-imobiliare-promotions]");
    expect(Boolean(promotions)).toBe(expected);
    if (promotions) {
      expect(promotions.getAttribute("data-embedded")).toBe("true");
      expect(container.querySelector('[data-slots="imobiliare_ro"]')?.compareDocumentPosition(promotions)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
  } finally { await cleanup(container, root); }
});

it.each([
  ["superadmin", true, true, true],
  ["superadmin", false, true, false],
  ["superadmin", true, false, false],
  ["agency", true, true, true],
  ["agency", false, true, false],
  ["agency", true, false, false],
] as const)("Imopedia în %s: activat=%s credențiale=%s → rând=%s", async (area, activated, credential, expected) => {
  state.portalId = "imopedia";
  state.activated = activated;
  state.hasCredential = credential;
  const { container, root } = await renderPortal(area);
  try {
    const info = container.querySelector("[data-imopedia-package]");
    expect(Boolean(info)).toBe(expected);
    if (info) {
      expect(info.getAttribute("data-org")).toBe(area === "superadmin" ? "o1" : null);
      expect(container.querySelector('[data-slots="imopedia"]')?.compareDocumentPosition(info)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
  } finally { await cleanup(container, root); }
});
