import { describe, expect, it } from "vitest";
import { Route as Home } from "@/routes/index";
import { Route as Pricing } from "@/routes/preturi";
import { Route as Integrations } from "@/routes/integrari";
import { Route as Features } from "@/routes/functionalitati";
import { Route as Blog } from "@/routes/blog.index";
import { Route as About } from "@/routes/despre";
import { Route as Agencies } from "@/routes/agentii.index";
import { Route as Contact } from "@/routes/contact";
import { Route as Developers } from "@/routes/dezvoltatori";
import { Route as Faq, FAQ_GROUPS } from "@/routes/intrebari-frecvente";
import { flattenGraphNodes } from "./structured-data";

type Node = Record<string, unknown>;
function graphs(route: { options: { head?: unknown } }, context: unknown = { loaderData: [] }): Node[] {
  const head = (route.options.head as (c: unknown) => { scripts?: { type?: string; children: string }[] })(context);
  return (head.scripts ?? []).filter((s) => s.type === "application/ld+json").map((s) => JSON.parse(s.children) as Node);
}

const pages = { Home, Pricing, Integrations, Features, Blog, About, Agencies, Contact, Developers, Faq };

describe("@graph plat pe paginile publice", () => {
  for (const [name, route] of Object.entries(pages)) {
    it(`${name}: fiecare element din @graph e obiect cu @type, fără @context interior`, () => {
      const all = graphs(route);
      expect(all.length).toBeGreaterThan(0);
      for (const g of all) {
        const nodes = g["@graph"] as unknown[];
        expect(Array.isArray(nodes)).toBe(true);
        for (const n of nodes) {
          expect(Array.isArray(n)).toBe(false);
          expect(typeof n).toBe("object");
          expect((n as Node)["@type"]).toBeTruthy();
          expect((n as Node)["@context"]).toBeUndefined();
        }
      }
    });
  }

  it("/intrebari-frecvente are FAQPage cu toate întrebările și răspunsurile din pagină", () => {
    const nodes = graphs(Faq).flatMap((g) => g["@graph"] as Node[]);
    expect(nodes.some((n) => n["@type"] === "WebPage")).toBe(true);
    const faq = nodes.find((n) => n["@type"] === "FAQPage");
    const entities = (faq?.["mainEntity"] ?? []) as { name: string; acceptedAnswer: { text: string } }[];
    const visible = FAQ_GROUPS.flatMap((g) => g.faqs);
    expect(entities.map((e) => [e.name, e.acceptedAnswer.text])).toEqual(visible.map((f) => [f.q, f.a]));
    for (const id of ["portaluri", "preturi", "import", "ansambluri"]) expect(FAQ_GROUPS.some((g) => g.id === id)).toBe(true);
    for (const f of visible) {
      const sentences = f.a.split(/(?<=[.!?])\s+/).filter(Boolean).length;
      expect(sentences).toBeGreaterThanOrEqual(2);
      expect(sentences).toBeLessThanOrEqual(4);
    }
  });

  it("listele incluse sunt aplatizate", () => {
    expect(flattenGraphNodes([[{ "@type": "WebPage" }, { "@type": "FAQPage" }]]).map((n) => n["@type"])).toEqual(["WebPage", "FAQPage"]);
    expect(flattenGraphNodes({ "@context": "x", "@graph": [[{ "@type": "A" }]] }).map((n) => n["@type"])).toEqual(["A"]);
  });
});
