// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    Link: ({ to, children, activeOptions, ...rest }: Record<string, unknown>) =>
      React.createElement("a", { href: String(to), ...rest }, children as React.ReactNode),
    useRouterState: () => "/app/requests",
  };
});
vi.mock("@/components/app/UserAvatar", () => ({ UserAvatar: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {} } }));

import { AppSidebar, agencyNavFor } from "./AppSidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
  window.localStorage.clear();
});

it("Clienți restrâns oferă Contacte și Cereri, iar Contracte e pagină proprie", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const onNavigate = vi.fn();
  act(() => root?.render(
    <TooltipProvider>
      <AppSidebar groups={agencyNavFor(true)} organizationName="Test" roleLabel="Admin"
        collapsed onNavigate={onNavigate} badges={{ "/app/requests": 3 }} />
    </TooltipProvider>,
  ));
  const trigger = document.querySelector<HTMLButtonElement>('button[aria-label="Clienți"]');
  expect(trigger).not.toBeNull();
  expect(trigger?.getAttribute("data-tour")).toBe("group:Clienți");
  expect(trigger?.getAttribute("data-nav-targets")).toBe("nav:/app/contacts nav:/app/requests nav:/app/contracts");
  expect(trigger?.className).toContain("bg-sidebar-accent");
  await act(async () => {
    trigger?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  const items = [...document.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]')];
  expect(items.map(item => item.getAttribute("href"))).toEqual(["/app/contacts", "/app/requests", "/app/contracts"]);
  expect(items.map(item => item.textContent)).toEqual(["Contacte", "Cereri3", "Contracte"]);
  expect(items[1]?.getAttribute("aria-current")).toBe("page");
  await act(async () => items[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
  expect(onNavigate).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="menu"]')).toBeNull();
});