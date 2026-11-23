import { describe, expect, it } from "vitest";
const BASE = "http://localhost:8080";
describe("/integrari pentru portalurile Partner API", () => {
  for (const [slug, name] of [["propri-ro", "propri.ro"], ["cauta-ro", "cauta.ro"]] as const) {
    it(`${slug} răspunde 200 cu un H1, canonical și FAQPage plat`, async () => {
      const res = await fetch(`${BASE}/integrari/${slug}`);
      expect(res.status).toBe(200);
      const html = (await res.text()).replace(/<!-- -->/g, "");
      expect(html.match(/<h1[\s>]/g)?.length).toBe(1);
      expect(html).toMatch(new RegExp(`<h1[^>]*>Integrare Habitoo CRM cu ${name.replace(".", "\\.")}</h1>`));
      expect(html).toContain(`rel="canonical" href="https://www.habitoo.ro/integrari/${slug}"`);
      expect(html).toContain('"@type":"FAQPage","mainEntity":[{"@type":"Question"');
    });
  }
  it("propri.ro apare în lista publică cu logo, iar logoul se servește fără autentificare", async () => {
    const html = await (await fetch(`${BASE}/integrari`)).text();
    expect(html).toContain("/integrari/propri-ro");
    expect(html).toContain("/api/public/feed/propri-ro/logo");
    const logo = await fetch(`${BASE}/api/public/feed/propri-ro/logo`);
    expect(logo.status).toBe(200);
  });
  it("un portal fără pagină publică dă 404", async () => {
    expect((await fetch(`${BASE}/integrari/portal-inexistent-ro`)).status).toBe(404);
  });
});
