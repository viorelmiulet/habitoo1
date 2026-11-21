import { describe, expect, it } from "vitest";
import { compareCost, planForAgents } from "@/lib/marketing/comparison-content";

const BASE = "http://localhost:8080";
const PAGES = ["/comparatie", "/comparatie/cost-crm-pe-agentie-vs-pe-agent", "/alternative"];
const BANNED = ["immoflux", "rebs", "crmrebs", "realvia", "hubspot", "salesforce", "zoho", "pipedrive", "imoeasy", "bitrix", "monday.com", "propertybase", "kvcore", "follow up boss", "agentimage"];

function graph(html: string): Record<string, unknown>[] {
  const blocks = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1] ?? "{}"));
  return blocks.flatMap((b) => (Array.isArray(b["@graph"]) ? b["@graph"] : [b]));
}

describe("pagini de comparație", () => {
  for (const path of PAGES) {
    it(`${path}: 200, un H1, canonical, FAQPage și fără alte CRM-uri`, async () => {
      const res = await fetch(`${BASE}${path}`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
      expect(html).toMatch(new RegExp(`<link[^>]*rel="canonical"[^>]*href="https://www\\.habitoo\\.ro${path}"`));
      const nodes = graph(html);
      for (const n of nodes) expect(typeof n["@type"]).toBe("string");
      const faq = nodes.find((n) => n["@type"] === "FAQPage") as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] } | undefined;
      expect(faq?.mainEntity.length).toBeGreaterThanOrEqual(5);
      for (const q of faq?.mainEntity ?? []) expect(q.acceptedAnswer.text.length).toBeGreaterThan(0);
      expect(nodes.some((n) => n["@type"] === "BreadcrumbList")).toBe(true);
      expect(nodes.some((n) => n["@type"] === "WebPage")).toBe(true);
      if (path.includes("cost-crm")) {
        expect(nodes.some((n) => n["@type"] === "WebApplication")).toBe(true);
        expect(html).toContain("Exemplu: 8 agenți");
      }
      const lower = html.toLowerCase();
      for (const name of BANNED) expect(lower, name).not.toContain(name);
    }, 15000);
  }
  it("apar în sitemap și în llms.txt", async () => {
    const sitemap = await (await fetch(`${BASE}/sitemap-pages.xml`)).text();
    const llms = await (await fetch(`${BASE}/llms.txt`)).text();
    for (const p of PAGES) { expect(sitemap).toContain(`https://www.habitoo.ro${p}<`); expect(llms).toContain(`https://www.habitoo.ro${p})`); }
  }, 15000);
});

describe("calculul costului", () => {
  it("alege planul după numărul de agenți", () => {
    expect(planForAgents(1)).toBe("basic");
    expect(planForAgents(3)).toBe("basic");
    expect(planForAgents(4)).toBe("pro");
    expect(planForAgents(10)).toBe("pro");
    expect(planForAgents(11)).toBe("unlimited");
  });
  it("aplică reducerea de 50% la plata anuală", () => {
    const r = compareCost(8, 20);
    expect(r.currentMonthly).toBe(160);
    expect(r.currentAnnual).toBe(1920);
    expect(r.plan).toBe("pro");
    expect(r.habitooMonthly).toBe(40);
    expect(r.habitooAnnual).toBe(240);
    expect(r.habitooAnnualMonthlyBilling).toBe(480);
    expect(compareCost(2, 15).habitooAnnual).toBe(60);
    expect(compareCost(25, 10).habitooAnnual).toBe(600);
  });
});
