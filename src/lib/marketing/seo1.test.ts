import { describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start/server-entry", () => ({ default: { fetch: async () => new Response("html", { headers: { "content-type": "text/html" } }) } }));
import { permanentPublicRedirect, publicCacheControl, PUBLIC_PAGE_CACHE } from "./public-http";
import { publicCacheControl as edgeCache } from "@/lib/host-policy";
import { publicHead } from "@/components/marketing/public-head";
import { pageJsonLd } from "@/components/marketing/structured-data";
import { developerFaq } from "@/components/marketing/developer-faq";
import { CHROME_EXTENSION_URL } from "@/components/marketing/chrome-extension-content";
import { llmsFullResponse } from "./llms-full";
import { buildSitemapXml } from "@/lib/blog-discovery";
import { contentModified } from "./content-revisions";
import { changedRevisions } from "./indexnow";
import server from "@/server";

describe("SEO1 public delivery", () => {
  it("permanently redirects public trailing slashes preserving query, not private endpoints", () => {
    for (const path of ["/preturi/", "/functionalitati/proprietati/", "/integrari/storia/", "/agentii/", "/blog/articol/"]) {
      const result = permanentPublicRedirect(new Request(`https://www.habitoo.ro${path}?x=1`));
      expect(result?.status).toBe(308);
      expect(result?.headers.get("location")).toBe(`https://www.habitoo.ro${path.slice(0,-1)}?x=1`);
    }
    expect(permanentPublicRedirect(new Request("https://www.habitoo.ro/api/public/x/"))).toBeNull();
  });
  it("uses exactly 600 seconds shared cache on public HTML", () => {
    const request = new Request("https://www.habitoo.ro/preturi");
    const response = new Response("html", { headers: { "Content-Type": "text/html" } });
    expect(publicCacheControl(request,response)).toBe(PUBLIC_PAGE_CACHE);
    expect(edgeCache(request,response)).toBe("public, max-age=0, s-maxage=600, stale-while-revalidate=86400");
  });
  it("app and session-dependent pages are never shared", () => {
    const response = new Response("html", { headers: { "Content-Type": "text/html" } });
    expect(publicCacheControl(new Request("https://www.habitoo.ro/app"),response)).toBe("no-store");
    expect(edgeCache(new Request("https://www.habitoo.ro/preturi",{headers:{cookie:"session=fake"}}),response)).toBeNull();
  });
  it("actual server entry returns no-store on GET and HEAD /app", async () => {
    // The Start renderer is injected below: no account access or network call.
    for (const method of ["GET", "HEAD"]) {
      const response = await server.fetch(new Request("http://localhost:8080/app", { method }), {}, {});
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });
  it("developers graph has WebPage, breadcrumb and factual FAQ; entity identifies Chrome Store", () => {
    const head = publicHead({path:"/dezvoltatori",title:"Documentație Habitoo",description:"API și feed",jsonLd:[...pageJsonLd({path:"/dezvoltatori",name:"Dezvoltatori",description:"API și feed"}),{"@type":"FAQPage",mainEntity:developerFaq.map(f=>({"@type":"Question",name:f.q,acceptedAnswer:{"@type":"Answer",text:f.a}}))}]});
    const graph=JSON.parse(head.scripts[0].children)["@graph"];
    expect(graph.find((n:Record<string,unknown>)=>n["@type"]==="WebPage").dateModified).toBe("2026-11-17");
    expect(graph.some((n:Record<string,unknown>)=>n["@type"]==="BreadcrumbList")).toBe(true);
    expect(graph.find((n:Record<string,unknown>)=>n["@type"]==="FAQPage").mainEntity).toHaveLength(4);
    expect(graph.find((n:Record<string,unknown>)=>n["@type"]==="Organization").sameAs).toContain(CHROME_EXTENSION_URL);
  });
  it("llms-full returns 200 with complete sections and content", async () => {
    const response=llmsFullResponse();expect(response.status).toBe(200);
    const body=await response.text();
    for(const section of ["## Prețuri și planuri","## Funcționalități","## Integrări","întrebări fréquente".replace("fréquente","frecvente")]) expect(body.toLowerCase()).toContain(section.toLowerCase());
    expect(body).toContain("/functionalitati/proprietati");expect(body).toContain("Basic: 10 €/lună; 60 €/an");
  });
  it("sitemap uses editorial revision not generation time; includes images and opt-in profiles", () => {
    const xml=buildSitemapXml([{slug:"exemplu",title:"Articol",excerpt:"Test",status:"published",published_at:"2026-10-01T00:00:00Z",updated_at:"2026-11-02T12:00:00Z",cover_image_url:"/assets/blog/example.jpg"}],new Date("2027-01-01"),true,[{name:"Demo",slug:"demo",logoUrl:null},{name:"Private",slug:null,logoUrl:null}]);
    expect(xml).toContain(`<loc>https://www.habitoo.ro/preturi</loc>\n    <lastmod>${contentModified("/preturi")}</lastmod>`);
    expect(xml).not.toContain("2027-01-01");expect(xml).toContain("<image:image>");expect(xml).toContain("https://www.habitoo.ro/assets/blog/example.jpg");expect(xml).toContain("/agentii/demo");expect(xml).not.toContain("/agentii/null");
  });
  it("IndexNow batches only changed public revisions, deduplicates and excludes private URLs", () => {
    const page={url:"https://www.habitoo.ro/preturi",revision:"2026-11-17"};
    expect(changedRevisions([page,page,{url:"https://www.habitoo.ro/app",revision:"x"}],[])).toEqual([page]);
    expect(changedRevisions([page],[page])).toEqual([]);
  });
});