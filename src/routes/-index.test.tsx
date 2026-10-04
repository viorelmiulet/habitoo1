import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
    Link: ({ children, to, ...props }: React.PropsWithChildren<{ to: string }>) => (
      <a href={to} {...props}>{children}</a>
    ),
  };
});

vi.mock("@/components/marketing/CrmLink", () => ({
  CrmLink: ({ children, to, ...props }: React.PropsWithChildren<{ to: string }>) => (
    <a href={to} {...props}>{children}</a>
  ),
}));

vi.mock("@/components/marketing/CookieConsent", () => ({ CookieConsent: () => null }));
vi.mock("@/components/marketing/HomeHeader", () => ({ HomeHeader: () => <a href="/login">Autentificare</a> }));
vi.mock("@/components/marketing/PublicFooter", () => ({ PublicFooter: () => null }));
vi.mock("@/components/marketing/HomePricingSection", () => ({ HomePricingSection: () => null }));
vi.mock("@/components/marketing/FaqSection", () => ({ FaqSection: () => null, faqPageJsonLd: () => ({}) }));
vi.mock("@/components/marketing/structured-data", () => ({ homeIdentityJsonLd: () => [] }));
vi.mock("@/components/marketing/public-head", () => ({ publicHead: () => ({}) }));
vi.mock("@/components/marketing/mockups/DashboardMock", () => ({ DashboardMock: () => <div /> }));

import { Route } from "./index";

describe("pagina principală", () => {
  let host: HTMLDivElement | null = null;
  afterEach(() => {
    host?.remove();
    host = null;
  });

  it("afișează mesajul principal și acțiunile esențiale", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    const Component = Route.options.component;
    if (!Component) throw new Error("Componenta paginii lipsește");
    act(() => createRoot(host as HTMLDivElement).render(<Component />));

    expect(document.body.textContent).toContain("Transformă cererile și proprietățile în tranzacții închise.");
    expect(Array.from(document.querySelectorAll("a")).some((link) => link.textContent?.includes("Începe acum"))).toBe(true);
    expect(Array.from(document.querySelectorAll("a")).some((link) => link.textContent?.includes("Autentificare"))).toBe(true);
  });
});