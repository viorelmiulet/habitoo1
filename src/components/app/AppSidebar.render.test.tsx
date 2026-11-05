// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mock = vi.hoisted(() => ({ pathname: "/app" }));

vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    Link: ({ to, children, className, activeOptions, ...rest }: Record<string, unknown>) =>
      React.createElement(
        "a",
        { href: String(to), className: className as string, ...rest },
        children as React.ReactNode,
      ),
    useRouterState: () => mock.pathname,
    useRouter: () => ({ navigate: () => undefined }),
  };
});
vi.mock("@/components/app/UserAvatar", () => ({ UserAvatar: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {} } }));

import { AppSidebar, agencyNavFor, type NavGroup } from "./AppSidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

let root: ReturnType<typeof createRoot> | null = null;

function renderSidebar(groups: NavGroup[], collapsed = false) {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      <TooltipProvider>
        <AppSidebar
          groups={groups}
          organizationName="MVA Imobiliare"
          roleLabel="Agent"
          variant="agency"
          collapsed={collapsed}
        />
      </TooltipProvider>,
    ),
  );
}

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  window.localStorage.clear();
  mock.pathname = "/app";
});

describe("meniul lateral randat", () => {
  for (const admin of [true, false]) {
    it(`rol ${admin ? "admin" : "agent"}: arată numai paginile permise`, () => {
      renderSidebar(agencyNavFor(admin));
      const links = [...document.querySelectorAll("nav a")].map(a => a.getAttribute("href"));
      expect(links.includes("/app/team")).toBe(admin);
      expect(links.includes("/abonament")).toBe(admin);
      expect(document.querySelector('[href="/app/settings"]')?.textContent).toBe(admin ? "Setări agenție" : "Profilul meu");
      expect(document.querySelector('[data-tour="nav:/app/leads"]')).not.toBeNull();
    });
    it(`rol ${admin ? "admin" : "agent"}: restrâns are o singură intrare per grup`, () => {
      renderSidebar(agencyNavFor(admin), true);
      expect(document.querySelectorAll("nav [data-nav-row]")).toHaveLength(13);
      expect(document.querySelector('nav button[aria-label="Proprietăți"]')).not.toBeNull();
      expect(document.querySelector('nav a[href="/app/properties/new"]')).toBeNull();
      expect(document.querySelector('nav button[aria-label="Setări"]')).not.toBeNull();
      expect(document.querySelector('[data-tour="group:Portofoliu"]')?.textContent).toBe("");
    });
  }
  it("deschide grupul activ și păstrează închiderea în stocarea locală", () => {
    mock.pathname = "/app/properties/new";
    renderSidebar(agencyNavFor(true));
    const group = document.querySelector<HTMLButtonElement>('[data-tour="group:Portofoliu"]');
    expect(group?.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector('[aria-current="page"]')?.getAttribute("href")).toBe("/app/properties/new");
    act(() => group?.click());
    expect(group?.getAttribute("aria-expanded")).toBe("false");
    expect(JSON.parse(window.localStorage.getItem("habitoo.sidebar.groups.anonymous") ?? "[]")).not.toContain("Proprietăți");
  });
  it("păstrează selectorii ghidului și numele agenției", () => {
    renderSidebar(agencyNavFor(true));
    expect(document.querySelector('[data-tour="main-navigation"]')).not.toBeNull();
    expect(document.querySelector('[data-tour="group:Portofoliu"]')).not.toBeNull();
    expect(document.querySelector('[data-tour="group:Clienți"]')).not.toBeNull();
    expect(document.querySelector('[data-tour="nav:/app/collaboration"]')).not.toBeNull();
    expect(document.body.textContent).toContain("MVA Imobiliare");
  });
  it("restrâns folosește iconița deschisă, iar meniul extins logo-ul lat", () => {
    renderSidebar(agencyNavFor(true), true);
    const mark = document.querySelector<HTMLImageElement>('a[aria-label="Habitoo CRM — acasă"] img');
    expect(mark?.getAttribute("src")).toContain("habitoo-mark-light");
    expect(mark?.getAttribute("src")).not.toContain("favicon");

    renderSidebar(agencyNavFor(true), false);
    const logo = document.querySelector<HTMLImageElement>('a[aria-label="Habitoo CRM — acasă"] img');
    expect(logo?.getAttribute("src")).toContain("habitoo-sidebar-light");
    expect(logo?.getAttribute("src")).not.toContain("favicon");
  });
});
