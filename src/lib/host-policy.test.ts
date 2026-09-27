import { describe, expect, it } from "vitest";
import { CRM_ROBOTS_TXT, PUBLIC_ROBOTS_TXT, decideEdge, shouldTagNoindex } from "./host-policy";

const req = (url: string, method = "GET") => new Request(url, { method });
const html = new Response("x", { headers: { "content-type": "text/html; charset=utf-8" } });
const xml = new Response("x", { headers: { "content-type": "application/xml" } });

describe("host policy", () => {
  it("apex → 301 www, cu cale și query", () => {
    expect(decideEdge(req("https://habitoo.ro/preturi?a=1&b=2"))).toEqual({
      kind: "redirect",
      location: "https://www.habitoo.ro/preturi?a=1&b=2",
    });
    expect(decideEdge(req("https://habitoo.ro/api/public/x", "POST")).kind).toBe("redirect");
  });
  it("paginile de prezentare pe crm → 301 www", () => {
    for (const p of ["/", "/functionalitati", "/preturi", "/despre", "/contact", "/termeni", "/politica-de-confidentialitate"]) {
      expect(decideEdge(req(`https://crm.habitoo.ro${p}?q=1`))).toEqual({
        kind: "redirect",
        location: `https://www.habitoo.ro${p}?q=1`,
      });
    }
  });
  it("app, auth, api, media rămân pe crm", () => {
    for (const p of ["/app", "/app/properties", "/login", "/auth/callback", "/api/public/feed/properstar/index/k.xml", "/api/public/mailgun/events", "/assets/a.webp", "/oferta/1"]) {
      expect(decideEdge(req(`https://crm.habitoo.ro${p}`)).kind).toBe("pass");
    }
  });
  it("www nu redirecționează", () => {
    expect(decideEdge(req("https://www.habitoo.ro/preturi")).kind).toBe("pass");
  });
  it("robots diferit pe crm, neschimbat pe www", () => {
    expect(decideEdge(req("https://crm.habitoo.ro/robots.txt"))).toEqual({ kind: "robots", body: CRM_ROBOTS_TXT });
    expect(decideEdge(req("https://www.habitoo.ro/robots.txt"))).toEqual({ kind: "robots", body: PUBLIC_ROBOTS_TXT });
  });
  it("X-Robots-Tag doar pe HTML crm, nu pe api/public sau non-HTML", () => {
    expect(shouldTagNoindex(req("https://crm.habitoo.ro/app"), html)).toBe(true);
    expect(shouldTagNoindex(req("https://crm.habitoo.ro/api/public/feed/x"), html)).toBe(false);
    expect(shouldTagNoindex(req("https://crm.habitoo.ro/assets/a.webp"), xml)).toBe(false);
    expect(shouldTagNoindex(req("https://www.habitoo.ro/preturi"), html)).toBe(false);
  });
});
