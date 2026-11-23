import { describe, expect, it, vi } from "vitest";
import { buildMarketingFactSheet, marketingContextHash, validateMarketingFacts } from "../facts";
import { generateMarketingContent } from "../agent.server";
import { portalDescriptionFromDraft } from "../portal-description";
import { AiTracer } from "@/lib/ai/tracing/trace";
import type { AIProvider } from "@/lib/ai/providers/types";
import { parseMarketingContent } from "../content";
import { advertToXml, type ProperstarAdvert } from "@/lib/portals/properstar/mapper";
const row = { id: "property", rooms: 2, bedrooms: 1, usable_surface: 65.5, price: 90000, currency: "EUR", city: "Cluj-Napoca", district: "Centru", utilities: ["Apă"], description: "Apartament 2 camere" };
const facts = buildMarketingFactSheet(row);
describe("variantele și postările nu inventează fapte", () => {
  it("contractul fix respinge forme incomplete sau array-uri cu valori non-text", () => {
    expect(parseMarketingContent(JSON.stringify({ body: "2 camere" }), true).ok).toBe(false);
    expect(parseMarketingContent(JSON.stringify({ title: null, body: "2 camere", shortVariants: [], cta: null, hashtags: [100], ideas: [] }), true).ok).toBe(false);
  });
  it("Properstar păstrează descrierea română și adaugă separat varianta engleză aprobată", () => {
    const advert = { title: null, description: "2 camere", englishDescription: "2 rooms", photos: [], amenities: [], videos: [], virtualTours: [], office: {}, agent: {} } as unknown as ProperstarAdvert;
    const xml = advertToXml(advert);
    expect(xml).toContain('<Description Language="ro">'); expect(xml).toContain('<Description Language="en">'); expect(xml).toContain("2 rooms");
  });
  it.each(["Apartament cu piscină, 2 camere", "Apartment with sauna, 2 rooms", "Apartment with balcony, 2 rooms", "Swimming pool and private parking", "3 bedrooms, 90 square metres", "Preț 100000 EUR", "Only 10 minutes to subway"])("respinge %s", (text) => expect(validateMarketingFacts(text, facts).status).toBe("invalid"));
  it.each(["2 camere, 65.5 mp, 90000 EUR, Cluj-Napoca", "2 rooms, 1 bedroom, 65.5 sqm, 90000 EUR", "#Apartament #ClujNapoca 2 camere"])("acceptă doar faptele existente: %s", (text) => expect(validateMarketingFacts(text, facts).status).toBe("valid"));
  it("AI simulat invalid nu este un rezultat salvabil după regenerare", async () => {
    const provider: AIProvider = { id: "mock", model: "mock", supportsTools: false, generate: vi.fn(async () => ({ text: JSON.stringify({ title: null, body: "Apartament cu piscină și 7 camere", shortVariants: [], cta: null, hashtags: [], ideas: [] }), toolCalls: [], inputTokens: 1, outputTokens: 1 })) };
    const result = await generateMarketingContent({ provider, tracer: new AiTracer("mock", { organizationId: "org", userId: "user" }), facts, channel: "storia", tone: "professional", length: "long", contentType: "listing", branding: null, existingText: null, notes: null, missing: [] });
    expect(result.ok && result.result.validation.status).toBe("invalid");
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });
  it("descrierea de portal este separată și necesită aplicare explicită", () => {
    const draft = { body: "2 rooms", context_hash: marketingContextHash(facts), context_snapshot: { portalDescription: "properstar" }, applied_at: null };
    expect(portalDescriptionFromDraft(draft, row, "properstar")).toBeNull();
    expect(portalDescriptionFromDraft({ ...draft, applied_at: "2026-11-23" }, row, "properstar")).toBe("2 rooms");
    expect(row.description).toBe("Apartament 2 camere");
    expect(portalDescriptionFromDraft({ ...draft, applied_at: "2026-11-23" }, row, "storia")).toBeNull();
  });
  it("schimbarea datelor sau textul inventat invalidează varianta salvată", () => {
    const draft = { body: "2 rooms", context_hash: marketingContextHash(facts), context_snapshot: { portalDescription: "properstar" }, applied_at: "2026-11-23" };
    expect(portalDescriptionFromDraft(draft, { ...row, rooms: 3 }, "properstar")).toBeNull();
    expect(portalDescriptionFromDraft({ ...draft, body: "swimming pool" }, row, "properstar")).toBeNull();
  });
});