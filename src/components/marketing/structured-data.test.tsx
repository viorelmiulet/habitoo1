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
import { Route as Integration } from "@/routes/integrari_.$slug";
import { Route as Article } from "@/routes/blog.$slug";
import { publicGraphJsonLd, SERVICE_ID } from "./structured-data";

type Node = Record<string, unknown>;
function requiredNode(nodes: Node[], type: string): Node {
  const node = nodes.find(item => item["@type"] === type);
  if (!node) throw new Error(`Missing ${type}`);
  return node;
}
function ld(route: { options: { head?: unknown } }, context: unknown = {}): Node[] {
  const head = (route.options.head as (c: unknown) => { scripts: { children: string }[] })(context);
  const out: Node[] = [];
  for (const s of head.scripts) {
    const v = JSON.parse(s.children);
    out.push(...(v["@graph"] ?? (Array.isArray(v) ? v : [v])));
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
  it("firma are datele legale și adresa fără stradă", () => {
    const org = requiredNode(ld(Home), "Organization");
    expect(org.legalName).toBe("MVA PERFECT BUSINESS S.R.L.");
    expect(org.taxID).toBe("50477503");
    expect(org.identifier).toEqual({ "@type": "PropertyValue", propertyID: "Registrul Comerțului", value: "J2024018361001" });
    expect(org.address).toEqual({ "@type": "PostalAddress", addressLocality: "Dudu, comuna Chiajna", addressRegion: "Ilfov", addressCountry: "RO" });
  });

  it("aceleași identități și oferte pe Home, Prețuri, integrare și articol", () => {
    const contexts: [typeof Home | typeof Pricing | typeof Integration | typeof Article, unknown][] = [
      [Home, {}], [Pricing, {}], [Integration, { loaderData: { slug: "storia-olx" } }],
      [Article, { loaderData: { post: { id: "test", slug: "articol-test", title: "Articol", excerpt: "Descriere", author_name: "Autor privat", published_at: "2026-10-01", updated_at: "2026-10-01" } } }],
    ];
    for (const [route, context] of contexts) {
      const head = (route.options.head as (c: unknown) => { scripts: { children: string }[] })(context);
      expect(head.scripts).toHaveLength(1);
      expect(JSON.parse(head.scripts[0].children)["@context"]).toBe("https://schema.org");
      const nodes = ld(route, context);
      for (const id of [ORG_ID, WEBSITE_ID, SOFTWARE_ID, SERVICE_ID]) expect(nodes.filter(n => n["@id"] === id)).toHaveLength(1);
      expect(requiredNode(nodes, "Organization").sameAs).toEqual(["https://www.facebook.com/profile.php?id=61594347749722", "https://share.google/iZtYGwvM9YTQjM0VT"]);
      expect((requiredNode(nodes, "SoftwareApplication").offers as Node[]).map(o => o.price)).toEqual([10, 40, 100]);
      expect(JSON.stringify(nodes)).not.toMatch(/Autor privat|"Person"|aggregateRating|"review"/);
    }
    expect(requiredNode(ld(Article, contexts[3][1]), "BlogPosting").author).toEqual({ "@id": ORG_ID });
  });

  it("Service păstrează audiența și cele șase teme cerute", () => {
    const service = requiredNode((publicGraphJsonLd()["@graph"] as Node[]), "Service");
    expect(service.name).toBe("CRM imobiliar pentru agenții imobiliare");
    expect(service.areaServed).toEqual({ "@type": "Country", name: "România" });
    expect(service.audience).toEqual({ "@type": "Audience", audienceType: "agenții și agenți imobiliari" });
    expect(service.knowsAbout).toEqual(["CRM imobiliar", "publicare pe portaluri imobiliare", "anunțuri de la proprietari", "analiză comparativă de piață", "colaborare între agenții", "comisioane agenți"]);
  });
  it("pagina principală definește identitatea comună", () => {
    const n = ld(Home);
    expect(types(n)).toEqual(
      expect.arrayContaining(["Organization", "WebSite", "SoftwareApplication", "FAQPage"]),
    );
    const org = requiredNode(n, "Organization");
    expect(org["@id"]).toBe(ORG_ID);
    expect(String(org.logo)).toMatch(/^https:\/\/www\.habitoo\.ro\//);
    expect(org.sameAs).toEqual(["https://www.facebook.com/profile.php?id=61594347749722", "https://share.google/iZtYGwvM9YTQjM0VT"]);
    const contactPoint = org.contactPoint as Node;
    expect(contactPoint.email).toBe("contact@habitoo.ro");
    expect(contactPoint.telephone).toBe("+40767941512");
    expect(contactPoint.contactType).toBe("customer support");
    const site = requiredNode(n, "WebSite");
    expect(site["@id"]).toBe(WEBSITE_ID);
    expect(site.potentialAction).toBeUndefined();
    const sw = requiredNode(n, "SoftwareApplication");
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
    const page = requiredNode(n, type);
    expect(page.isPartOf).toEqual({ "@id": WEBSITE_ID });
    expect([ORG_ID, SOFTWARE_ID]).toContain((page.about as Node)["@id"]);
    const bc = requiredNode(n, "BreadcrumbList");
    const items = bc.itemListElement as Node[];
    expect(items[0].item).toBe("https://www.habitoo.ro/");
    expect(String(items[1].item)).toMatch(/^https:\/\/www\.habitoo\.ro\/.+/);
    // Identitatea comună este prezentă o singură dată pe fiecare pagină.
    expect(n.filter(x => x["@id"] === ORG_ID)).toHaveLength(1);
    expect(n.filter(x => x["@id"] === WEBSITE_ID)).toHaveLength(1);
  });

  it("prețurile din JSON-LD sunt cele din tabel", () => {
    const sw = requiredNode(ld(Pricing), "SoftwareApplication");
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
