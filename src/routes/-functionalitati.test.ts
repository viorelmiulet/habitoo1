import { describe, expect, it } from "vitest";
import { FEATURE_ENTRIES, FEATURE_PAGES, featureHref, featurePageForSection } from "@/lib/marketing/feature-pages";

const EXPECTED_PAGES = [
  ["proprietati", "Gestiunea proprietăților agenției, într-o singură fișă", "program gestiune proprietăți imobiliare"],
  ["contacte", "Toți clienții agenției, cu istoricul complet", "CRM clienți agenție imobiliară"],
  ["cereri", "Cererile clienților, transformate în criterii clare", "evidență cereri clienți imobiliare"],
  ["lead-uri", "Pipeline-ul de vânzări al agenției, de la primul contact la tranzacție", "pipeline vânzări imobiliare"],
  ["potriviri-automate", "Potriviri automate între cereri și proprietăți", "matching proprietăți clienți"],
  ["activitati", "Toate activitățile agenției, legate de client și proprietate", "activități agenție imobiliară"],
  ["calendar", "Vizionările și întâlnirile echipei, într-o singură agendă", "calendar vizionări imobiliare"],
  ["obiective", "Obiective lunare pentru fiecare agent, cu progres real", "obiective agenți imobiliari"],
  ["dashboard", "Un ecran de start pentru fiecare rol din agenție", "dashboard agenție imobiliară"],
  ["rapoarte", "Cifrele agenției, fără calcule de mână", "rapoarte agenție imobiliară"],
  ["contracte", "Contractele agenției, generate și semnate din CRM", "contracte agenție imobiliară"],
  ["echipa-si-roluri", "Toată echipa agenției, cu drepturi clare pentru fiecare rol", "CRM pentru echipa agenției imobiliare"],
  ["aplicatie-mobil", "Habitoo pe telefon, la vizionare și pe teren", "CRM imobiliar pe telefon"],
] as const;

function decode(text: string) {
  return text.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&gt;/g, ">").replace(/&lt;/g, "<");
}

// Randează paginile prin serverul de dezvoltare (SSR).
describe("/functionalitati", () => {
  it("răspunde 200 și are câte un link pentru fiecare funcție", async () => {
    const res = await fetch("http://localhost:8080/functionalitati");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(FEATURE_ENTRIES.length).toBeGreaterThan(0);
    for (const e of FEATURE_ENTRIES) expect(html).toContain(`href="${featureHref(e)}"`);
    for (const [slug] of EXPECTED_PAGES) {
      expect(html).toContain(`href="/functionalitati/${slug}"`);
    }
    expect(html).not.toContain('href="#matching"');
    expect(html).not.toContain('href="/functionalitati#matching"');
  });
  it("la pagina potrivirilor înlocuiește secțiunea matching, fără dubluri", () => {
    expect(featurePageForSection("matching")?.slug).toBe("potriviri-automate");
    expect(FEATURE_ENTRIES.filter((e) => e.key === "matching")).toHaveLength(0);
    expect(FEATURE_ENTRIES.filter((e) => e.key === "potriviri-automate")).toHaveLength(1);
  });
  it.each(EXPECTED_PAGES)("%s: pagină completă și metadate", async (slug, h1, phrase) => {
    const response = await fetch(`http://localhost:8080/functionalitati/${slug}`);
    expect(response.status).toBe(200);
    const html = await response.text();
    const title = decode(html.match(/<title[^>]*>([^<]*)<\/title>/)?.[1] ?? "");
    const heading = decode(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "");
    const descriptionTag = html.match(/<meta\b[^>]*name="description"[^>]*>/)?.[0] ?? "";
    const description = decode(descriptionTag.match(/content="([^"]*)"/)?.[1] ?? "");
    expect(heading).toBe(h1);
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.toLocaleLowerCase("ro")).toContain(phrase.toLocaleLowerCase("ro"));
    expect(title).not.toBe(heading);
    expect(description.length).toBeGreaterThanOrEqual(140);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description.toLocaleLowerCase("ro")).toContain(phrase.toLocaleLowerCase("ro"));
    const page = FEATURE_PAGES.find((p) => p.slug === slug);
    if (!page) throw new Error(`Missing feature ${slug}`);
    const text = [...page.intro, ...page.benefits.flatMap((b) => [b.title, b.text]), ...page.steps.flatMap((s) => [s.title, s.text]), ...page.faq.flatMap((f) => [f.q, f.a])].join(" ");
    const count = text.trim().split(/\s+/u).length;
    expect(count).toBeGreaterThanOrEqual(500);
    expect(count).toBeLessThanOrEqual(800);
    expect(text).not.toMatch(/\b(API|feed|OAuth|JSON|XML)\b/i);
    for (const paragraph of page.intro) expect(html).toContain(paragraph);
    for (const b of page.benefits) expect(html).toContain(b.text);
    for (const s of page.steps) expect(html).toContain(s.text);
    for (const f of page.faq) expect(html).toContain(f.a);
    expect(page.related.length).toBeGreaterThanOrEqual(3);
    expect(page.related.length).toBeLessThanOrEqual(5);
  });
  it("adresa veche a ecranului de start trimite la /functionalitati/dashboard", async () => {
    const res = await fetch("http://localhost:8080/functionalitati/ecran-de-start", { redirect: "manual" });
    expect([301, 302, 307, 308]).toContain(res.status);
    expect(res.headers.get("location") ?? "").toContain("/functionalitati/dashboard");
  });
  it("paginile noi au categoria cerută", () => {
    const cat = Object.fromEntries(FEATURE_PAGES.map((p) => [p.slug, p.category]));
    for (const s of ["activitati", "calendar", "obiective", "echipa-si-roluri", "aplicatie-mobil"]) expect(cat[s]).toBe("Echipă și organizare");
    for (const s of ["dashboard", "rapoarte", "contracte"]) expect(cat[s]).toBe("Analize și documente");
    const known = new Set([...FEATURE_PAGES.map((p) => p.slug), ...FEATURE_ENTRIES.map((e) => e.key)]);
    for (const p of FEATURE_PAGES) for (const r of p.related) expect(known.has(r), `${p.slug} → ${r}`).toBe(true);
  });
  it("un slug necunoscut dă 404", async () => {
    const res = await fetch("http://localhost:8080/functionalitati/functie-inexistenta");
    expect(res.status).toBe(404);
  });
});
