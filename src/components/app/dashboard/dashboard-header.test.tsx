// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    Link: ({ to, children, className, ...rest }: Record<string, unknown>) =>
      React.createElement(
        "a",
        { href: String(to), className: className as string, ...rest },
        children as React.ReactNode,
      ),
  };
});
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@tanstack/react-start", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-start")>()),
  useServerFn: () => vi.fn(),
}));
vi.mock("@/lib/dashboard.functions", () => ({
  getAgentDashboard: {},
  getManagerDashboard: {},
  completeDashboardTask: {},
}));
vi.mock("@/hooks/use-session", () => ({
  useCurrentUser: () => ({
    data: {
      userId: "u1",
      role: "agent",
      profile: { full_name: "Ana Pop" },
      organization: { id: "o1", name: "MVA Imobiliare" },
    },
  }),
}));
vi.mock("@/hooks/use-home-dashboard", () => ({
  HOME_STAGES: [],
  useHomeDashboard: () => ({ data: undefined, isLoading: true }),
}));
vi.mock("@/components/app/PropertyThumb", () => ({ PropertyThumb: () => null, usePropertyCovers: () => () => ({}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {} } }));

import { AgentDashboard } from "./AgentDashboard";
import { ManagerDashboard } from "./ManagerDashboard";
import { HomeDashboard } from "./HomeDashboard";

let root: ReturnType<typeof createRoot> | null = null;

function render(node: React.ReactNode) {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root?.render(node));
}

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
});

describe("pagina Acasă", () => {
  it("un singur h1 cu salutul și butoanele rapide", () => {
    render(<HomeDashboard organizationId="o1" firstName="Ana" />);
    const h1 = document.querySelectorAll("h1");
    expect(h1).toHaveLength(1);
    expect(h1[0].textContent).toMatch(/^Bună (dimineața|ziua|seara), Ana!$/);
    expect(document.body.textContent).toContain("Iată ce se întâmplă azi în agenția ta.");
    expect(document.querySelector('a[href="/app/properties/new"]')?.textContent).toContain("Adaugă proprietate");
    expect(document.querySelector('a[href="/app/requests"]')?.textContent).toContain("Adaugă cerere");
  });

  it("extrasele pe rol nu adaugă alte titluri de pagină", () => {
    render(<AgentDashboard />);
    expect(document.querySelectorAll("h1")).toHaveLength(0);
    render(<ManagerDashboard />);
    expect(document.querySelectorAll("h1")).toHaveLength(0);
  });
});
