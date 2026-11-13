import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", async (orig) => {
  const actual = await orig<typeof import("@tanstack/react-router")>();
  const Link = ({ children, to, params: _p, search: _s, ...rest }: Record<string, unknown>) => <a href={String(to)} {...rest}>{children as never}</a>;
  return { ...actual, Link };
});
vi.mock("@/components/marketing/CrmLink", () => ({ CrmLink: ({ children, to }: { children: unknown; to: string }) => <a href={to}>{children as never}</a> }));
vi.mock("@/components/marketing/HomeHeader", () => ({ HomeHeader: () => null }));
vi.mock("@/components/marketing/PublicFooter", () => ({ PublicFooter: () => null }));
vi.mock("@/components/marketing/CookieConsent", () => ({ CookieConsent: () => null }));

import { HomeContent } from "@/components/marketing/home/HomeContent";
import { HOME_DESCRIPTION, HOME_FAQ, HOME_TITLE } from "@/components/marketing/home/home-content";
import { faqPageJsonLd } from "@/components/marketing/FaqSection";
import { portalsLabel, publicPortalCount } from "@/lib/portals/integration-pages";
import { PLAN_PRICES } from "@/lib/plans";

const html = renderToString(<HomeContent dynamic={[]} />);

describe("pagina principală (SSR)", () => {
  it("are H1-ul nou cu „CRM imobiliar” și „AI”", () => {
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1].replace(/<[^>]+>/g, "") ?? "";
    expect(h1).toBe("CRM imobiliar cu AI pentru agențiile din România");
    expect(html).toContain("Începe gratuit");
    expect(html).toContain("Vezi cum funcționează");
  });

  it("titlul și descrierea conțin „CRM imobiliar” și „AI”", () => {
    for (const text of [HOME_TITLE, HOME_DESCRIPTION]) {
      expect(text).toContain("CRM imobiliar");
      expect(text).toMatch(/\bAI\b/);
    }
  });

  it("are secțiunea Habitoo AI cu mesajul de încredere", () => {
    expect(html).toContain('id="habitoo-ai"');
    expect(html).toContain("agentul decide.");
    expect(html).toContain("AI-ul propune, tu aprobi. Nimic nu se trimite fără acordul tău.");
    for (const title of ["Agentul AI CRM", "AI Marketing", "Studio AI", "Voce AI în română", "Comentariu AI în ACP"]) expect(html).toContain(title);
  });

  it("numărul de portaluri vine din sursa existentă", () => {
    expect(html).toContain(`${portalsLabel(publicPortalCount([]))} integrate`);
  });

  it("prețurile rămân neschimbate și fiecare plan are Habitoo AI inclus", () => {
    expect(PLAN_PRICES.basic.monthly).toBe(10);
    expect(PLAN_PRICES.pro.monthly).toBe(40);
    expect(PLAN_PRICES.unlimited.monthly).toBe(100);
    for (const p of [10, 40, 100]) expect(html).toContain(`${p}<!-- --> €`);
    const pricing = html.slice(html.indexOf('id="preturi"'), html.indexOf("Ce poate face Habitoo AI?"));
    expect(pricing.match(/Habitoo AI inclus/g)?.length).toBe(3);
  });

  it("FAQ-ul și datele structurate includ întrebarea nouă", () => {
    expect(HOME_FAQ.length).toBe(11);
    expect(html).toContain("Ce poate face Habitoo AI?");
    expect(JSON.stringify(faqPageJsonLd(HOME_FAQ))).toContain("Ce poate face Habitoo AI?");
  });
});
