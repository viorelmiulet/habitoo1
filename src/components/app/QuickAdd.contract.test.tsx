// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    Link: ({ to, children, ...rest }: Record<string, unknown>) =>
      React.createElement("a", { href: String(to), ...rest }, children as React.ReactNode),
    useNavigate: () => () => undefined,
  };
});
vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({ mutate: () => undefined, isPending: false }),
  useQueryClient: () => ({ invalidateQueries: () => undefined }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ insert: async () => ({ error: null }) }) } }));
vi.mock("@/hooks/use-session", () => ({
  useCurrentUser: () => ({ data: { userId: "u1", organization: { id: "o1" } } }),
}));
vi.mock("@/components/app/ActivityDialog", () => ({ ActivityDialog: () => null }));
vi.mock("@/lib/onboarding-tour", () => ({ announceGuideContext: () => undefined }));
vi.mock("@/components/app/contracts/NewContractDialog", async () => {
  const React = await import("react");
  return {
    NewContractDialog: ({ open }: { open: boolean }) =>
      open ? React.createElement("div", { role: "dialog" }, "Document nou") : null,
  };
});

import { QuickAdd } from "./QuickAdd";

let root: ReturnType<typeof createRoot> | null = null;

function renderQuickAdd() {
  document.body.innerHTML = "";
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root?.render(<QuickAdd />));
}

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
});

describe("Adăugare rapidă — Contract", () => {
  it("meniul conține „Contract” imediat după „Cerere”", async () => {
    renderQuickAdd();
    const trigger = document.querySelector<HTMLButtonElement>('[data-tour="quick-add-open"]')!;
    await act(async () => {
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    const labels = [...document.querySelectorAll('[data-tour="quick-add-menu"] [role="menuitem"]')].map(
      (el) => el.textContent?.trim(),
    );
    expect(labels).toEqual(["Proprietate", "Contact", "Lead", "Cerere", "Contract", "Activitate", "Vizionare"]);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("alegerea „Contract” deschide fereastra „Document nou”", async () => {
    renderQuickAdd();
    const trigger = document.querySelector<HTMLButtonElement>('[data-tour="quick-add-open"]')!;
    await act(async () => {
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (el) => el.textContent?.trim() === "Contract",
    )!;
    await act(async () => {
      item.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Document nou");
  });
});
