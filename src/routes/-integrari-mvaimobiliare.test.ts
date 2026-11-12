import { describe, expect, it } from "vitest";

const BASE = "http://localhost:8080";

describe("/integrari/mvaimobiliare", () => {
  it("răspunde 200 cu titlul, H1 și mențiunea „gratuită”", async () => {
    const res = await fetch(`${BASE}/integrari/mvaimobiliare`);
    expect(res.status).toBe(200);
    const html = (await res.text()).replace(/<!-- -->/g, "");
    expect(html).toContain("<title>Integrare mvaimobiliare.ro cu CRM imobiliar | Habitoo</title>");
    expect(html).toMatch(/<h1[^>]*>Integrare mvaimobiliare.ro cu Habitoo CRM<\/h1>/);
    expect(html).toContain("Publicarea pe mvaimobiliare.ro este gratuită pentru agențiile Habitoo.");
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain('"@type":"BreadcrumbList"');
  });

  it("nu conține sume, chei sau adrese ale feedului", async () => {
    const html = await (await fetch(`${BASE}/integrari/mvaimobiliare`)).text();
    const main = html.slice(html.indexOf("<h1"), html.indexOf("Alte integrări"));
    expect(html).not.toContain("/api/public/feed");
    expect(html).not.toMatch(/hb[a-z]{2}_[A-Za-z0-9]/);
    expect(main).not.toMatch(/\d\s*(lei|ron|eur|euro|€|\$)/i);
  });

  it("apare în sitemap, în llms.txt și în lista de pe /integrari", async () => {
    expect(await (await fetch(`${BASE}/sitemap-pages.xml`)).text()).toContain("/integrari/mvaimobiliare</loc>");
    expect(await (await fetch(`${BASE}/llms.txt`)).text()).toContain("/integrari/mvaimobiliare)");
    expect(await (await fetch(`${BASE}/integrari`)).text()).toContain('href="/integrari/mvaimobiliare"');
  });
});
