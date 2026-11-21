import { describe, expect, it } from "vitest";

const BASE = "http://localhost:8080";
const PATH = "/functionalitati/ansambluri-rezidentiale";

function graph(html: string): Record<string, unknown>[] {
  const blocks = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1] ?? "{}"));
  return blocks.flatMap((b) => (Array.isArray(b["@graph"]) ? b["@graph"] : [b]));
}

describe(PATH, () => {
  it("răspunde 200 cu un singur H1, canonical corect și FAQPage valid", async () => {
    const res = await fetch(`${BASE}${PATH}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toContain("CRM pentru ansambluri rezidențiale și dezvoltatori");
    expect(html).toMatch(new RegExp(`<link[^>]*rel="canonical"[^>]*href="https://www\\.habitoo\\.ro${PATH}"`));
    const nodes = graph(html);
    for (const n of nodes) expect(typeof n["@type"]).toBe("string");
    const faq = nodes.find((n) => n["@type"] === "FAQPage") as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] } | undefined;
    expect(faq?.mainEntity.length).toBeGreaterThanOrEqual(5);
    expect(faq?.mainEntity.map((q) => q.name)).toContain("Pot publica un ansamblu pe Storia din CRM?");
    expect(nodes.some((n) => n["@type"] === "BreadcrumbList")).toBe(true);
    expect(nodes.some((n) => n["@type"] === "WebPage")).toBe(true);
  });
  it("apare în sitemap și în llms.txt", async () => {
    const sitemap = await (await fetch(`${BASE}/sitemap-pages.xml`)).text();
    expect(sitemap).toContain(PATH);
    const llms = await (await fetch(`${BASE}/llms.txt`)).text();
    expect(llms).toContain(PATH);
  });
});
