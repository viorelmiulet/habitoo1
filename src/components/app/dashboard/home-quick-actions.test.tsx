// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    Link: ({ to, search, children, className }: Record<string, unknown>) =>
      React.createElement(
        "a",
        { href: String(to) + (search && (search as { new?: boolean }).new ? "?new=true" : ""), className: className as string },
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
const metric = { total: 0, createdAt: [] };
vi.mock("@/hooks/use-home-dashboard", () => ({
  HOME_STAGES: [],
  useHomeDashboard: () => ({
    isLoading: false,
    data: {
      metrics: { properties: metric, requests: metric, leads: metric, contacts: metric },
      stages: [],
      latestProperties: [],
      latestLeads: [],
      today: [],
      recProperties: [],
      newMatches: [],
    },
  }),
}));
vi.mock("@/components/app/PropertyThumb", () => ({ PropertyThumb: () => null, usePropertyCovers: () => () => ({}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }));

import { HomeDashboard } from "./HomeDashboard";

let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
});

describe("Acasă: elemente readuse (CR16)", () => {
  it("butoane rapide, Mesajul zilei, linkuri agendă, un h1, fără Publicări pe portaluri", () => {
    document.body.innerHTML = "";
    const host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root?.render(<HomeDashboard organizationId="o1" firstName="Ana" />));
    const hrefs = [...document.querySelectorAll("a")].map((a) => [a.getAttribute("href"), a.textContent ?? ""]);
    const has = (href: string, text: string) => hrefs.some(([h, t]) => h === href && t.includes(text));
    expect(has("/app/properties/new", "Adaugă proprietate")).toBe(true);
    expect(has("/app/requests?new=true", "Adaugă cerere")).toBe(true);
    expect(has("/app/activities?new=true", "+ Adaugă activitate")).toBe(true);
    expect(has("/app/activities", "Vezi agenda")).toBe(true);
    expect(document.body.textContent).toContain("Mesajul zilei");
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(document.body.textContent).not.toContain("Publicări pe portaluri");
  });
});
