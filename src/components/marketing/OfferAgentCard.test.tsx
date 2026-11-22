import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import type { ReactNode } from "react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, params }: { children: ReactNode; params: { slug: string } }) => <a href={`/agentii/${params.slug}`}>{children}</a>,
}));
const { OfferAgentCard } = await import("./OfferAgentCard");
const { offerJsonLd } = await import("@/lib/marketing/offer-seo");
const { agencyJsonLd } = await import("@/lib/marketing/agency-seo");

type Agent = { agencySlug: string | null; fullName: string | null; avatarUrl: string | null; phone: string | null; phoneIsAgent: boolean };
const visible: Agent = { agencySlug: "expert", fullName: "Ana Pop", avatarUrl: "/api/public/agent-avatar/expert/ana-pop", phone: "0722 000 000", phoneIsAgent: true };
const hidden: Agent = { agencySlug: "expert", fullName: null, avatarUrl: null, phone: "021 111 111", phoneIsAgent: false };
const html = (agent: Agent) => renderToString(<OfferAgentCard agent={agent} agencyName="EXPERT REAL ESTATE" agencyLogoUrl="https://x/logo.png" agencyContacts={["021 111 111", "www.expert.ro"]} />);
const base = { slug: "ap-1", title: "Ap", description: null, price: 1, currency: "EUR", transactionKind: "sale", city: null, county: null, district: null, agencyName: "EXPERT REAL ESTATE", image: null, updatedAt: "2026-11-01" };

describe("cardul Agent pe ofertă", () => {
  it("arată nume, poză prin proxy, telefon public și link spre agenție, fără email", () => {
    const h = html(visible);
    expect(h).toContain("Ana Pop");
    expect(h).toContain('src="/api/public/agent-avatar/expert/ana-pop"');
    expect(h).toContain("0722 000 000");
    expect(h).toContain('href="/agentii/expert"');
    expect(h).not.toContain("@");
    expect(h).not.toContain("mailto:");
  });
  it("agentul ascuns apare doar ca agenție (nume, logo, contact public)", () => {
    const h = html(hidden);
    expect(h).not.toContain("agent-avatar");
    expect(h).toContain("EXPERT REAL ESTATE");
    expect(h).toContain("logo.png");
    expect(h).toContain("021 111 111");
  });
  it("este randat pe server în pagina ofertei", () => {
    const page = readFileSync("src/routes/oferta.$id.tsx", "utf8");
    expect(page).toContain("<OfferAgentCard");
    expect(page).not.toMatch(/ClientOnly/);
  });
});

describe("JSON-LD ofertă", () => {
  const graph = (agent: Agent) => offerJsonLd({ ...base, agent }) as Record<string, unknown>[];
  it("Person cu worksFor agenția, legat prin offeredBy", () => {
    const g = graph(visible);
    for (const n of g) { expect(Array.isArray(n)).toBe(false); expect(n["@type"]).toBeTruthy(); }
    const person = g.find(n => n["@type"] === "Person")!;
    expect(person["worksFor"]).toEqual({ "@id": "https://www.habitoo.ro/agentii/expert#agency" });
    expect(g.find(n => n["@type"] === "RealEstateAgent")!["@id"]).toBe("https://www.habitoo.ro/agentii/expert#agency");
    expect(person["telephone"]).toBe("0722 000 000");
    expect((g[0]!["offers"] as Record<string, unknown>)["offeredBy"]).toEqual({ "@id": person["@id"] });
  });
  it("agent ascuns: offeredBy e doar agenția", () => {
    const g = graph(hidden);
    expect(g.some(n => n["@type"] === "Person")).toBe(false);
    expect((g[0]!["offers"] as Record<string, unknown>)["offeredBy"]).toEqual({ "@id": "https://www.habitoo.ro/agentii/expert#agency" });
  });
});

describe("pagina agenției și fostele pagini de agent", () => {
  it("agenția nu conține agenți în HTML sau JSON-LD", () => {
    const route = readFileSync("src/routes/agentii.$slug.tsx", "utf8");
    expect(route).not.toMatch(/agents|Agenți<|\$agent/);
    const ld = JSON.stringify(agencyJsonLd({ name: "E", slug: "e", description: null, logoUrl: null, city: null, phone: null, email: null, website: null }, []));
    expect(ld).not.toMatch(/Person|employee/);
  });
  it("pagina de agent face 301 spre agenție", () => {
    const route = readFileSync("src/routes/agentii.$slug_.$agent.tsx", "utf8");
    expect(route).toContain('redirect({ to: "/agentii/$slug", params: { slug: params.slug }, statusCode: 301 })');
    expect(route).not.toContain("component");
  });
});
