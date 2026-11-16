// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { CHROME_EXTENSION_URL } from "@/components/marketing/chrome-extension-content";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let extensionTokens: unknown[] = [];

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
  useQuery: () => ({ data: extensionTokens, isLoading: false, isError: false }),
}));
vi.mock("@tanstack/react-start", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-start")>()),
  useServerFn: () => vi.fn(),
}));
vi.mock("@/lib/extension.functions", () => ({ listExtensionTokens: {} }));

import { ExtensionPromoCard } from "./ExtensionPromoCard";

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
  extensionTokens = [];
});

describe("cardul Habitoo Catch de pe Acasă", () => {
  it("fără dispozitiv conectat: butonul spre store folosește CHROME_EXTENSION_URL și apare „Conectează extensia”", () => {
    render(<ExtensionPromoCard />);
    const store = document.querySelector(`a[href="${CHROME_EXTENSION_URL}"]`);
    expect(store).not.toBeNull();
    expect(store?.getAttribute("target")).toBe("_blank");
    expect(store?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(store?.textContent).toContain("Instalează din Chrome Web Store");
    expect(document.querySelector('a[href="/app/extensie/conectare"]')?.textContent).toContain("Conectează extensia");
    expect(document.body.textContent).toContain("Preia anunțuri de pe portaluri direct în CRM");
  });

  it("cu dispozitiv conectat: arată „Extensia este conectată” și păstrează doar linkul spre store", () => {
    extensionTokens = [{ id: "t1" }];
    render(<ExtensionPromoCard />);
    expect(document.body.textContent).toContain("Extensia este conectată.");
    expect(document.querySelector(`a[href="${CHROME_EXTENSION_URL}"]`)).not.toBeNull();
    expect(document.querySelector('a[href="/app/extensie/conectare"]')).toBeNull();
  });
});
