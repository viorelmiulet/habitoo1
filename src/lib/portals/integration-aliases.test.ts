import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BLOG_SITE_URL, buildStaticSitemapXml } from "@/lib/blog-discovery";
import {
  INTEGRATION_PAGES,
  integrationPageAliasTarget,
  integrationPageAliases,
  integrationPageBySlug,
} from "./integration-pages";

// Redirecțiile se verifică pe un server pornit: INTEGRATION_ALIAS_TEST_BASE_URL
// (implicit http://localhost:8080), la fel ca testele rutei blogului.
const BASE = process.env.INTEGRATION_ALIAS_TEST_BASE_URL ?? "http://localhost:8080";
const reachable = async () => {
  try {
    return (await fetch(`${BASE}/integrari/storia`)).ok;
  } catch {
    return false;
  }
};

/** Adresele cerute explicit, cu pagina canonică așteptată. */
const REQUESTED: Record<string, string> = {
  "storia-olx": "storia",
  "storia-ro": "storia",
  "olx-storia": "storia",
  "storia-olx-ro": "storia",
  imobiliare: "imobiliare-ro",
  "imobiliare.ro": "imobiliare-ro",
  lacheie: "la-cheie",
  "lacheie-ro": "la-cheie",
  publi24: "publi24-romimo",
  romimo: "publi24-romimo",
  "romimo-publi24": "publi24-romimo",
  facebook: "catalog-facebook",
  "facebook-catalog": "catalog-facebook",
  meta: "catalog-facebook",
  "imobiliare-plus": "imobiliareplus",
  "imobiliareplus-ro": "imobiliareplus",
};

describe("aliasurile paginilor de integrare", () => {
  it("fiecărui alias cerut îi corespunde pagina canonică cerută", () => {
    for (const [alias, slug] of Object.entries(REQUESTED)) {
      expect(integrationPageAliasTarget(alias), alias).toBe(slug);
    }
  });

  it("varianta cu sufix -ro duce la pagina fără sufix", () => {
    for (const slug of ["imospot", "vdi", "zonata", "locuit", "imobli", "imo24", "homedirect", "imopedia", "ofera", "zup", "olx", "primulanunt", "homepitch", "imove", "properstar", "clickimob"]) {
      expect(integrationPageAliasTarget(`${slug}-ro`), `${slug}-ro`).toBe(slug);
    }
  });

  it("niciun alias nu trimite la o pagină inexistentă și niciun alias nu e o pagină reală", () => {
    const slugs = new Set(INTEGRATION_PAGES.map((p) => p.slug));
    const aliases = integrationPageAliases();
    expect(aliases.length).toBeGreaterThanOrEqual(Object.keys(REQUESTED).length);
    for (const { alias, slug } of aliases) {
      expect(slugs.has(slug), `${alias} → ${slug}: pagina canonică lipsește`).toBe(true);
      expect(slugs.has(alias), `${alias}: aliasul e o pagină reală`).toBe(false);
      expect(integrationPageBySlug(slug)?.slug, `${alias} → ${slug}`).toBe(slug);
    }
  });

  it("o adresă inventată nu e alias", () => {
    for (const unknown of ["portal-inexistent", "storia-olx-roo", "storia-ro-ro", "imobiliare-ro-ro", "", "   "]) {
      expect(integrationPageAliasTarget(unknown), JSON.stringify(unknown)).toBeNull();
    }
  });

  it("sitemap-ul conține paginile canonice și niciun alias", () => {
    const xml = buildStaticSitemapXml();
    for (const { alias } of integrationPageAliases()) {
      expect(xml, alias).not.toContain(`<loc>${BLOG_SITE_URL}/integrari/${alias}</loc>`);
    }
    expect(xml).toContain(`<loc>${BLOG_SITE_URL}/integrari/storia</loc>`);
    expect(xml).toContain(`<loc>${BLOG_SITE_URL}/integrari/imobiliare-ro</loc>`);
  });

  it("ruta aplică aliasurile înainte ca loader-ul să dea 404", () => {
    const source = readFileSync("src/routes/integrari_.$slug.tsx", "utf8");
    expect(source).toContain("integrationPageAliasTarget");
    expect(source).toContain("statusCode: 301");
    expect(source).toContain("location.searchStr");
  });

  it("HTTP: aliasul merge 301 spre pagina canonică și păstrează query string-ul", async () => {
    if (!(await reachable())) return;
    const res = await fetch(`${BASE}/integrari/storia-olx?utm_source=portal&lang=ro`, { redirect: "manual" });
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/integrari/storia?utm_source=portal&lang=ro");

    const ro = await fetch(`${BASE}/integrari/imospot-ro?x=1`, { redirect: "manual" });
    expect(ro.status).toBe(301);
    expect(ro.headers.get("location")).toBe("/integrari/imospot?x=1");

    const canonical = await fetch(`${BASE}/integrari/storia?utm_source=portal`);
    expect(canonical.status).toBe(200);
  });

  it("HTTP: o adresă necunoscută rămâne 404", async () => {
    if (!(await reachable())) return;
    const res = await fetch(`${BASE}/integrari/portal-inexistent?x=1`, { redirect: "manual" });
    expect(res.status).toBe(404);
    expect(res.headers.get("location")).toBeNull();
  });
});
