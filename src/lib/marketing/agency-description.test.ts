import { describe, it, expect } from "vitest";
import { buildAgencyDescription, agencyDescriptionVariant, type AgencyDescriptionStats } from "./agency-description";
import { agencyJsonLd } from "./agency-seo";
import { publicCacheControl as edgeCache } from "../host-policy";
import { publicCacheControl, PUBLIC_PAGE_CACHE } from "./public-http";

const agency = { name: "Casa Bună", slug: "casa-buna", city: "Brașov", description: null as string | null, phone: "0268000000", email: null, website: null, logoUrl: null };
const stats: AgencyDescriptionStats = {
  total: 9, sale: 6, rent: 3,
  types: [{ value: "house", count: 2 }, { value: "apartment", count: 6 }, { value: "studio", count: 1 }],
  places: [{ value: "Brașov — Tractorul", count: 6 }, { value: "Săcele", count: 3 }],
  prices: [{ transaction: "sale", currency: "EUR", min: 70000, max: 250000, count: 6 }, { transaction: "rent", currency: "RON", min: 2000, max: 3500, count: 3 }],
  developments: ["Ansamblu Verde"],
};

describe("descriere automată publică", () => {
  it("descrierea proprie înlocuiește complet textul automat, fără mutații", () => {
    const input = { ...agency, description: "  Descriere proprie.  " };
    const result = buildAgencyDescription(input, stats);
    expect(result.description).toBe("Descriere proprie.");
    expect(result.automaticDescription).toContain("Casa Bună");
    expect(input.description).toBe("  Descriere proprie.  ");
  });
  it("include numai cifre, tipuri și locuri din agregatul public, în ordinea frecvenței", () => {
    const result = buildAgencyDescription(agency, stats).description ?? "";
    expect(result).toContain("9 oferte"); expect(result).toContain("6 la vânzare și 3 la închiriere");
    expect(result).toContain("apartamente, case și garsoniere");
    expect(result).toContain("Brașov — Tractorul și Săcele");
    expect(result).toContain("70.000–250.000 EUR"); expect(result).toContain("2.000–3.500 RON");
    expect(result).toContain("Ansamblu Verde"); expect(result).toContain(agency.phone);
    expect(result.split("\n\n")).toHaveLength(3);
    expect(result).not.toContain("București"); expect(result).not.toContain("500.000");
  });
  it("nu folosește afirmații interzise, agenți sau proprietari din obiecte suplimentare", () => {
    const untrustedAgency = { ...agency, agent: "Ion Agent", owner: "Proprietar Secret" };
    const untrustedStats = { ...stats, experience: 20 };
    const result = buildAgencyDescription(untrustedAgency, untrustedStats);
    expect(result.description).not.toMatch(/experiență|premii|lider|cea mai bună|clienți|Ion Agent|Proprietar Secret/i);
  });
  it("agenții cu date asemănătoare primesc variante distincte și stabile", () => {
    const a = buildAgencyDescription({ ...agency, slug: "agentia-a" }, stats).description;
    const b = buildAgencyDescription({ ...agency, slug: "agentia-b" }, stats).description;
    expect(a).not.toBe(b); expect(a).toBe(buildAgencyDescription({ ...agency, slug: "agentia-a" }, stats).description);
    expect(new Set(["a", "b", "c", "d"].map(slug => agencyDescriptionVariant(slug))).size).toBe(4);
  });
  it("fără oferte nu afișează descriere, inclusiv dacă există una proprie", () => {
    expect(buildAgencyDescription({ ...agency, description: "Proprie" }, { ...stats, total: 0 })).toEqual({ description: null, automaticDescription: null, metaDescription: null });
  });
  it("meta description are 140–160 caractere, inclusiv pentru nume foarte scurte sau lungi", () => {
    for (const name of ["A", "Casa Bună", "Agenție " + "Nume lung ".repeat(25)]) {
      for (const slug of ["a", "b", "c", "d"]) {
        const meta = buildAgencyDescription({ ...agency, name, slug, city: null }, stats).metaDescription ?? "";
        expect(meta.length).toBeGreaterThanOrEqual(140); expect(meta.length).toBeLessThanOrEqual(160);
      }
    }
  });
  it("intervalele apar de la trei oferte, separate pe tranzacție și monedă", () => {
    expect(buildAgencyDescription(agency, { ...stats, total: 2 }).description).not.toContain("70.000");
    const description = buildAgencyDescription(agency, { ...stats, total: 3, prices: stats.prices.map(p => ({ ...p, count: 2 })) }).description;
    expect(description).toContain("70.000–250.000 EUR");
    expect(description).toContain("2.000–3.500 RON");
  });
  it("JSON-LD folosește integral același text vizibil", () => {
    const result = buildAgencyDescription(agency, stats);
    expect(agencyJsonLd({ ...agency, description: result.description }, [])[0]?.["description"]).toBe(result.description);
  });
  it("citirea următoare reflectă imediat schimbarea ofertelor, nu o descriere salvată", () => {
    expect(buildAgencyDescription(agency, { ...stats, total: 10, sale: 7 }).description).toContain("7 la vânzare");
    expect(buildAgencyDescription(agency, stats).description).toContain("6 la vânzare");
    for (const policy of [edgeCache, publicCacheControl]) {
      const html = new Response("ok", { headers: { "content-type": "text/html" } });
      expect(policy(new Request("https://www.habitoo.ro/agentii/casa-buna"), html)).toBe("no-store");
      expect(policy(new Request("https://www.habitoo.ro/preturi"), html)).toBe(PUBLIC_PAGE_CACHE);
    }
  });
});