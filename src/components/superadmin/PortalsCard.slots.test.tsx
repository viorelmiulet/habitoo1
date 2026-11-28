import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { PortalsCard } from "./PortalsCard";
import { AgencyPortalSetupPage } from "@/components/app/AgencyPortalSetupPage";

const state = vi.hoisted(() => ({ activated: true, admin: true }));
vi.mock("@tanstack/react-start", async (original) => ({ ...await original<typeof import("@tanstack/react-start")>(), useServerFn: () => vi.fn() }));
vi.mock("@tanstack/react-router", async (original) => ({ ...await original<typeof import("@tanstack/react-router")>(), Link: ({ children }: { children: import("react").ReactNode }) => <a>{children}</a> }));
vi.mock("@/hooks/use-session", () => ({ useCurrentUser: () => ({ isLoading: false, data: { roles: state.admin ? ["agency_admin"] : ["agent"], organization: { id: "o1" } } }) }));
vi.mock("@/components/app/PortalSlotsCard", () => ({ PortalSlotsCard: ({ organizationId, portalId }: { organizationId?: string; portalId?: string }) => <section data-slots={portalId} data-org={organizationId} /> }));
vi.mock("@/components/app/HomezzAgentsPanel", () => ({ HomezzAgentsPanel: () => <section data-homezz-agents /> }));
vi.mock("@/components/app/StoriaAccountControls", () => ({ StoriaAccountControls: () => null }));
vi.mock("@/components/app/PortalLogo", () => ({ PortalLogoStack: () => null }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const connection = { status: "connected", activated: state.activated, hasPortalCredential: true };
    const portal = { id: "homezz", status: "available", configuration_schema: { fields: [{ key: "credential", target: "credentials", label: "Cheie", secret: true }] }, capabilities: [], authentication: ["portal_api_key"], directions: [] };
    return { isLoading: false, isError: false, data: queryKey[0] === "portal-hub" ? [{ portal, connection, keys: [], feed: {}, listings: { published: 0, failed: 0 }, supportsConnectionTest: true }]
      : queryKey[0] === "agency-portal-setup" ? { id: "homezz", displayName: "HomeZZ.ro", connection, fields: portal.configuration_schema.fields, supportsConnectionTest: true, keys: [] }
      : queryKey[0] === "agency-portal-catalog" ? [] : undefined };
  },
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it.each([true, false])("SuperAdmin: sloturi doar la portal activat=%s, după butoane și înainte de agenți", async (activated) => {
  state.activated = activated;
  window.sessionStorage.setItem("habitoo:portals-selected:o1", "homezz");
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<PortalsCard organizationId="o1" />));
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
  } finally { await act(async () => root.unmount()); container.remove(); window.sessionStorage.clear(); }
});

it.each([[true, true], [false, true], [true, false]])("agenție: activat=%s administrator=%s", async (activated, admin) => {
  state.activated = activated === true; state.admin = admin === true;
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<AgencyPortalSetupPage portalId="homezz" />));
    const slots = container.querySelector('[data-slots="homezz"]');
    expect(Boolean(slots)).toBe(activated && admin);
    if (slots) {
      const test = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Testează conexiunea"));
      expect(test?.compareDocumentPosition(slots)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(slots.compareDocumentPosition(container.querySelector("[data-homezz-agents]") as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
  } finally { await act(async () => root.unmount()); container.remove(); }
});