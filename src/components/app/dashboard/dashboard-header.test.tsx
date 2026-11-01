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
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
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
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {} } }));

import { AgentDashboard } from "./AgentDashboard";
import { ManagerDashboard } from "./ManagerDashboard";

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

describe("antetul secțiunilor de dashboard", () => {
  it("agent: niciun h1, un h2 „Ziua ta” cu aceleași acțiuni", () => {
    render(<AgentDashboard />);
    expect(document.querySelectorAll("h1")).toHaveLength(0);
    const h2 = document.querySelector("h2");
    expect(h2?.textContent).toBe("Ziua ta");
    expect(document.querySelector('a[href="/app/calendar"]')).not.toBeNull();
    expect(document.querySelector('a[href="/app/properties/new"]')).not.toBeNull();
  });

  it("admin: niciun h1, un h2 cu numele agenției și aceleași acțiuni", () => {
    render(<ManagerDashboard />);
    expect(document.querySelectorAll("h1")).toHaveLength(0);
    const h2 = document.querySelector("h2");
    expect(h2?.textContent).toBe("MVA Imobiliare");
    expect(document.querySelector('a[href="/app/reports"]')).not.toBeNull();
    expect(document.querySelector('a[href="/app/properties/new"]')).not.toBeNull();
  });
});
