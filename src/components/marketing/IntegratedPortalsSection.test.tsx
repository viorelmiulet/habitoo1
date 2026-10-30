import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { homepagePortals, INTEGRATION_PAGES, integrationSlugFor } from "@/lib/portals/integration-pages";
import { publicNav } from "./public-nav";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, params, children, ...props }: { to: string; params?: { slug: string }; children: ReactNode }) =>
    createElement("a", { ...props, href: params ? to.replace("$slug", params.slug) : to }, children),
}));
vi.mock("./Reveal", () => ({
  Reveal: ({ children }: { children: ReactNode }) => children,
}));

import { IntegratedPortalsSection } from "./IntegratedPortalsSection";

describe("homepage integration navigation", () => {
  it("places Integrări immediately after Funcționalități without changing the other destinations", () => {
    expect(publicNav.map(({ to }) => to)).toEqual([
      "/functionalitati", "/integrari", "/analiza-comparativa-de-piata", "/preturi", "/despre", "/blog", "/contact",
    ]);
    expect(publicNav[1]).toEqual({ to: "/integrari", label: "Integrări" });
  });

  it("links every homepage portal card to an existing public integration page", () => {
    const html = renderToStaticMarkup(<IntegratedPortalsSection />);
    const cards = [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((match) => match[1]);
    const portals = homepagePortals();
    expect(cards).toHaveLength(portals.length);
    for (const [index, { portal }] of portals.entries()) {
      const slug = integrationSlugFor(portal.id);
      expect(INTEGRATION_PAGES.some((page) => page.slug === slug), portal.id).toBe(true);
      expect(cards[index], portal.id).toContain(`href="/integrari/${slug}"`);
    }
  });

  it("links the all-integrations button to the integrations list", () => {
    const html = renderToStaticMarkup(<IntegratedPortalsSection />);
    expect(html).toMatch(/<a\b[^>]*href="\/integrari"[^>]*>Vezi toate integrările<\/a>/);
  });
});