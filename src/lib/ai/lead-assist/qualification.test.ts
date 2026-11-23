import { describe, expect, it } from "vitest";
import { qualifyLead } from "./qualification";
import { evidencedChanges } from "./evidence";
import { groundedLeadDraft, validatedLeadDraft, sanitizeExtraction, leadAiResponseSchema, type DraftProperty } from "./schema";

const message = "Caut un apartament cu 2 camere în Brașov. Buget maximum 80.000 EUR. Vreau o vizionare și balcon.";
const raw = { kind: "buy" as const, budget_max: 80000, currency: "EUR" as const, rooms_min: 2, property_type: "apartment", cities: ["Brașov"], wants_balcony: true };
const property: DraftProperty = { title: "Apartament", transaction_kind: "sale", property_type: "apartment", price: 79000, currency: "EUR", rooms: 2, surface: 54, usable_surface: 50, floor: 3, city: "Brașov", balcony: true, parking: null, description: null, status: "active" };
describe("calificare explicabilă și fapte cu dovadă", () => {
  it("scor peste 70 cu motiv din mesaj, buget, potrivire, interacțiuni și viteza clientului", () => {
    const result = qualifyLead(message, sanitizeExtraction(raw, message), property, [
      { direction: "in", body: "Bună", sent_at: "2026-11-23T10:00:00Z" },
      { direction: "out", body: "Ce buget aveți?", sent_at: "2026-11-23T10:05:00Z" },
      { direction: "in", body: message, sent_at: "2026-11-23T10:20:00Z" },
    ]);
    expect(result.score).toBe(95);
    expect(result.reason).toContain("Solicită vizionare"); expect(result.reason).toContain("Buget declarat");
    expect(result.reason).toContain("Prețul anunțului"); expect(result.reason).toContain("2 mesaje");
    expect(result.reason).toContain("maximum o oră");
  });
  it("lipsa datelor nu inventează buget sau viteză de răspuns", () => {
    const result = qualifyLead("Bună", sanitizeExtraction({}, "Bună"), null, []);
    expect(result.score).toBe(0); expect(result.reason).toContain("Nu există încă semnale verificabile");
  });
  it("monede diferite și răspunsul rapid al agentului nu cresc potrivirea/viteza clientului", () => {
    const result = qualifyLead("Buget 80.000 RON", sanitizeExtraction({ budget_max: 80000, currency: "RON" }, "Buget 80.000 RON"), property,
      [{ direction: "in", body: "Client", sent_at: "2026-11-23T10:00:00Z" }, { direction: "out", body: "Agent", sent_at: "2026-11-23T10:01:00Z" }]);
    expect(result.reason).not.toContain("Prețul anunțului"); expect(result.reason).not.toContain("Clientul răspunde");
  });
  it("fiecare filtru are fragmentul exact din sursă care îi dovedește valoarea", () => {
    const changes = evidencedChanges({}, raw, message);
    expect(changes.find(c => c.field === "budget_max")?.evidence).toBe("Buget maximum 80.000 EUR.");
    expect(changes.find(c => c.field === "rooms_min")?.evidence).toBe("Caut un apartament cu 2 camere în Brașov.");
    expect(changes.find(c => c.field === "wants_balcony")?.evidence).toBe("Vreau o vizionare și balcon.");
    expect(changes.every(c => c.evidence && message.includes(c.evidence))).toBe(true);
  });
  it("elimină tipuri, dotări, monede și termene inventate sau negate", () => {
    const source = "Caut 2 camere fără balcon, nemobilat. Buget 80.000 EUR.";
    const result = sanitizeExtraction({ property_type: "house", wants_balcony: true, furnished: true, currency: "RON", budget_max: 80000, term: "imediat" }, source);
    expect(result.property_type).toBeNull(); expect(result.wants_balcony).toBeNull(); expect(result.furnished).toBeNull(); expect(result.currency).toBeNull(); expect(result.term).toBeNull();
  });
  it("răspunsul ciornă folosește numai faptele proprietății, nu bugetul sau propunerile AI", () => {
    const draft = groundedLeadDraft(property);
    expect(draft).toContain("79.000 EUR"); expect(draft).toContain("50 m²"); expect(draft).toContain("2 camere");
    expect(draft).not.toContain("80.000"); expect(draft).not.toContain("11:00");
    expect(draft).toContain("confirm disponibilitatea"); expect(draft).toContain("vizionare");
    expect(groundedLeadDraft({ ...property, status: "sold" })).toContain("nu mai este activ");
  });
  it("răspunsul fără proprietate nu inventează preț/disponibilitate; format invalid respins", () => {
    expect(groundedLeadDraft(null)).not.toMatch(/\d/);
    expect(leadAiResponseSchema.safeParse({ request: { rooms_min: "2" }, intent: "viewing" }).success).toBe(false);
    expect(leadAiResponseSchema.safeParse({ request: null, draft: "text", intent: "other" }).success).toBe(false);
  });
  it("AI poate alege faptele relevante, dar nicio afirmație în afara propozițiilor verificate", () => {
    const valid = "Bună ziua! Prețul afișat este 79.000 EUR. Doriți să stabilim o vizionare?";
    expect(validatedLeadDraft(valid, property)).toBe(valid);
    expect(validatedLeadDraft("Bună ziua! Are piscină și 3 camere. Doriți să stabilim o vizionare?", property)).toBeNull();
    expect(validatedLeadDraft("Este disponibil imediat. Doriți să stabilim o vizionare?", property)).toBeNull();
  });
});