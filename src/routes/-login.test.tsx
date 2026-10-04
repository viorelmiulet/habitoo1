// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (config: Record<string, unknown>) => ({ options: config, useSearch: () => ({}) }),
    Link: ({ children, to: _to, ...props }: { children: React.ReactNode; to?: string }) => <a {...props}>{children}</a>,
    useNavigate: () => vi.fn(),
  };
});
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ removeQueries: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signInWithPassword: vi.fn(), resend: vi.fn() } },
}));
vi.mock("@/integrations/lovable/index", () => ({
  lovable: { auth: { signInWithOAuth: vi.fn() } },
}));

import { Route } from "./login";

describe("LoginPage", () => {
  it("conține câmpurile E-mail și Parolă și butonul Conectare", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const Component = Route.options.component;
    if (!Component) throw new Error("Componenta paginii lipsește");
    act(() => createRoot(host).render(<Component />));

    expect(host.querySelector('label[for="email"]')?.textContent).toBe("E-mail");
    expect(host.querySelector('label[for="password"]')?.textContent).toBe("Parolă");
    expect(host.querySelector('button[type="submit"]')?.textContent).toContain("Conectare");
  });
});