// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    Link: ({ to, children, className, activeOptions, ...rest }: Record<string, unknown>) =>
      React.createElement(
        "a",
        { href: String(to), className: className as string, ...rest },
        children as React.ReactNode,
      ),
    useRouterState: () => "/app",
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
    root!.render(
      <AppSidebar
        groups={groups}
        organizationName="MVA Imobiliare"
        roleLabel="Agent"
        variant="agency"
        collapsed={collapsed}
      />,
    ),
  );
}

function lists(): string[][] {
  return [...document.querySelectorAll("nav ul")].map((ul) =>
    [...ul.querySelectorAll("a")].map((a) => (a.textContent ?? "").trim()),
  );
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
});

describe("meniul cu Comisioane ca element separat", () => {
  for (const [name, isAdmin] of [
    ["administratorul", true],
    ["agentul", false],
  ] as const) {
    for (const [layout, collapsed] of [
      ["laterală desfășurată", false],
      ["meniul restrâns", true],
    ] as const) {
      it(`${name} vede Clienți (4 elemente) urmat de Comisioane fără titlu, în ${layout}`, () => {
        renderSidebar(agencyNavFor(isAdmin), collapsed);
        const groups = lists();
        const clientsIndex = groups.findIndex(
          (items) => items.join("|") === "Contacte|Cereri|Lead-uri|Contracte",
        );
        expect(clientsIndex).toBeGreaterThanOrEqual(0);
        expect(groups[clientsIndex + 1]).toEqual(["Comisioane"]);
        const commissionsList = [...document.querySelectorAll("nav ul")].find(
          (ul) =>
            ul.querySelectorAll("a").length === 1 &&
            ul.querySelector("a")?.getAttribute("href") === "/app/comisioane",
        );
        expect(commissionsList).toBeDefined();
        expect(commissionsList!.parentElement?.querySelector("p")).toBeNull();
      });
    }
  }
});
