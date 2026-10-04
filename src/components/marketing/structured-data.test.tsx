import { describe, expect, it } from "vitest";
import { PLAN_PRICES } from "@/lib/plans";
import { Route as Home } from "@/routes/index";
import { Route as Features } from "@/routes/functionalitati";
import { Route as Pricing } from "@/routes/preturi";
import { Route as About } from "@/routes/despre";
import { Route as Contact } from "@/routes/contact";
import { Route as Terms } from "@/routes/termeni";
import { Route as Privacy } from "@/routes/politica-de-confidentialitate";
import { ORG_ID, SOFTWARE_ID, WEBSITE_ID } from "./structured-data";

type Node = Record<string, unknown>;
function ld(route: { options: { head?: unknown } }): Node[] {
  const head = (route.options.head as (c: unknown) => { scripts: { children: string }[] })({});
  const out: Node[] = [];
  for (const s of head.scripts) {
    const v = JSON.parse(s.children);
    out.push(...(Array.isArray(v) ? v : [v]));
  }
  return out;
}
const types = (n: Node[]) => n.map((x) => x["@type"]);

const pages = [
  [Features, "WebPage"],
  [About, "AboutPage"],
  [Contact, "ContactPage"],
  [Terms, "WebPage"],
  [Privacy, "WebPage"],
  [Pricing, "WebPage"],
] as const;

describe("JSON-LD public", () => {
  it("pagina principală definește identitatea comună", () => {
    const n = ld(Home);
    expect(types(n)).toEqual(
      expect.arrayContaining(["Organization", "WebSite", "SoftwareApplication", "FAQPage"]),
    );
    const org = n.find((x) => x["@type"] === "Organization")!;
    expect(org["@id"]).toBe(ORG_ID);
    expect(String(org.logo)).toMatch(/^https:\/\/www\.habitoo\.ro\//);
    expect(org.sameAs).toEqual(["https://www.facebook.com/profile.php?id=61594347749722"]);
    const contactPoint = org.contactPoint as Node;
    expect(contactPoint.email).toBe("contact@habitoo.ro");
    expect(contactPoint.telephone).toBe("+40767941512");
    expect(contactPoint.contactType).toBe("customer support");
    const site = n.find((x) => x["@type"] === "WebSite")!;
    expect(site["@id"]).toBe(WEBSITE_ID);
    expect(site.potentialAction).toBeUndefined();
    const sw = n.find((x) => x["@type"] === "SoftwareApplication")!;
    expect(sw["@id"]).toBe(SOFTWARE_ID);
    expect(sw.publisher).toEqual({ "@id": ORG_ID });
  });

  it("FAQ-ul public și datele structurate includ Storia și OLX și Catalogul Facebook", () => {
    const faq = ld(Home).find((x) => x["@type"] === "FAQPage");
    const entries = faq?.mainEntity as Array<{ name: string; acceptedAnswer: { text: string } }>;
    const answer = entries.find((entry) => entry.name.startsWith("Pe ce portaluri"))?.acceptedAnswer.text;
    expect(answer).toContain("Storia și OLX");
    expect(answer).toContain("Catalogul Facebook (Meta)");
  });

  it.each(pages)("pagina are tipul corect, isPartOf și breadcrumb", (route, type) => {
    const n = ld(route);
    const page = n.find((x) => x["@type"] === type)!;
    expect(page.isPartOf).toEqual({ "@id": WEBSITE_ID });
    expect([ORG_ID, SOFTWARE_ID]).toContain((page.about as Node)["@id"]);
    const bc = n.find((x) => x["@type"] === "BreadcrumbList")!;
    const items = bc.itemListElement as Node[];
    expect(items[0].item).toBe("https://www.habitoo.ro/");
    expect(String(items[1].item)).toMatch(/^https:\/\/www\.habitoo\.ro\/.+/);
    // Identitatea nu e redefinită în afara paginii principale.
    expect(types(n)).not.toContain("Organization");
    expect(types(n)).not.toContain("WebSite");
  });

  it("prețurile din JSON-LD sunt cele din tabel", () => {
    const sw = ld(Pricing).find((x) => x["@type"] === "SoftwareApplication")!;
    expect(sw["@id"]).toBe(SOFTWARE_ID);
    const offers = sw.offers as Node[];
    expect(offers.map((o) => o.price)).toEqual([
      PLAN_PRICES.basic.monthly,
      PLAN_PRICES.pro.monthly,
      PLAN_PRICES.unlimited.monthly,
    ]);
    expect(offers.map((o) => o.price)).toEqual([10, 40, 100]);
    expect(PLAN_PRICES).toEqual({
      basic: { monthly: 10, annualMonthly: 5 },
      pro: { monthly: 40, annualMonthly: 20 },
      unlimited: { monthly: 100, annualMonthly: 50 },
    });
    for (const o of offers) {
      expect(o.priceCurrency).toBe("EUR");
      expect(o.url).toBe("https://www.habitoo.ro/preturi");
      expect((o.priceSpecification as Node).unitText).toBe("MONTH");
      expect((o.priceSpecification as Node)["@type"]).toBe("UnitPriceSpecification");
    }
  });

  it("FAQ-urile arată prețurile și totalurile anuale actualizate", () => {
    const homeFaq = ld(Home).find((x) => x["@type"] === "FAQPage");
    const pricingFaq = ld(Pricing).find((x) => x["@type"] === "FAQPage");
    const text = JSON.stringify([homeFaq, pricingFaq]);
    expect(text).toContain("Pro la 40 €/lună");
    expect(text).toContain("60 €/an pentru Basic, 240 €/an pentru Pro și 600 €/an pentru Unlimited");
    expect(text).not.toMatch(/Pro la 20 €|120\s*€\/an/);
  });

  it("fără aggregateRating sau review, FAQPage păstrat", () => {
    for (const r of [Home, Pricing, ...pages.map((p) => p[0])]) {
      const s = JSON.stringify(ld(r));
      expect(s).not.toMatch(/aggregateRating|"review"/i);
    }
    expect(types(ld(Home))).toContain("FAQPage");
    expect(types(ld(Pricing))).toContain("FAQPage");
  });
});
