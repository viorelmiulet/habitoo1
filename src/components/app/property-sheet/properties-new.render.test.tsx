// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tanstack/react-router", async (orig) => {
  const real = await orig<typeof import("@tanstack/react-router")>();
  return { ...real, createFileRoute: () => (opts: unknown) => ({ options: opts }), useNavigate: () => vi.fn(), useRouter: () => ({ state: { location: { href: "/" } } }), Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> };
});
vi.mock("@tanstack/react-start", async (orig) => ({ ...(await orig<object>()), useServerFn: () => vi.fn(async () => ({})) }));
vi.mock("@/integrations/supabase/client", () => {
  const q: Record<string, unknown> = {};
  const chain = new Proxy(q, { get: (_t, k) => k === "then" ? (r: (v: unknown) => void) => r({ data: [], error: null }) : () => chain });
  return { supabase: { from: () => chain, rpc: () => chain, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, storage: { from: () => chain } } };
});
vi.mock("@/hooks/use-session", () => ({ useCurrentUser: () => ({ data: { userId: "u1", organization: { id: "o1" }, profile: { full_name: "Ana" }, roles: [] } }) }));

describe("/app/properties/new", () => {
  it("se randează fără eroare", async () => {
    window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as never;
    globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
    const mod = await import("@/routes/_authenticated/app.properties.new");
    const Page = (mod.Route as unknown as { options: { component: React.ComponentType } }).options.component;
    const div = document.createElement("div"); document.body.appendChild(div);
    const errors: unknown[] = [];
    const root = createRoot(div, { onUncaughtError: (e) => errors.push(e), onCaughtError: (e) => errors.push(e) });
    await act(async () => { root.render(<QueryClientProvider client={new QueryClient()}><Suspense fallback="SUSP"><Page /></Suspense></QueryClientProvider>); });
    for (let i = 0; i < 20 && !div.textContent?.includes("Adaugă") && !errors.length; i++) await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    console.log("TEXT", div.textContent?.slice(0, 200));
    if (errors.length) console.log("ERR", errors[0]);
    expect(errors).toEqual([]);
    expect(div.textContent).toContain("Adaugă proprietate");
  });
});
