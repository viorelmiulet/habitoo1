import { describe, expect, it } from "vitest";
import { validateSummary, validateCall, confirmedChanges, dateFromEvidence } from "./schema";

const history = [{ id: "request:one", label: "Cerere", text: "Caută 3 camere în Cluj, buget 90000 EUR." }, { id: "view:one", label: "Vizionare efectuată", text: "A respins oferta din cauza zgomotului." }];
const transcript = "Vrea să cumpere un apartament cu 3 camere în Cluj, buget 90000 EUR. Revin cu telefon pe 25.11.2026.";
const call = { transcript, activity: "Vrea să cumpere un apartament cu 3 camere în Cluj, buget 90000 EUR.", followup: { excerpt: "Revin cu telefon pe 25.11.2026.", date: "2026-11-25" }, request: { kind: "buy", rooms_min: 3, cities: ["Cluj", "București"], budget_max: 90000, currency: "EUR", wants_parking: true } };
describe("client summary and call grounding", () => {
  it("rezumatul folosește exclusiv fragmente din istoricul contactului", () => {
    const result = validateSummary({ facts: history.map(f => ({ id: f.id, excerpt: f.text })), next: "followup" }, history);
    expect(result).toContain("3 camere în Cluj, buget 90000 EUR"); expect(result).toContain("din cauza zgomotului");
    expect(validateSummary({ facts: [{ id: "other-contact", excerpt: "Client din altă agenție" }], next: "clarify" }, history)).toBeNull();
    expect(validateSummary({ facts: [{ id: "request:one", excerpt: "Are 4 camere" }], next: "clarify" }, history)).toBeNull();
    expect(validateSummary({ facts: [{ id: "n1", excerpt: "vrea parcare." }], next: "clarify" }, [{ id: "n1", label: "Nota", text: "Nu vrea parcare." }])).toBeNull();
  });
  it("răspunsul invalid nu devine rezultat și nu strică pagina", () => {
    expect(validateSummary({ summary: "Inventat" }, history)).toBeNull(); expect(validateCall({ transcript: 12 })).toBeNull();
  });
  it("propunerile de cerere sunt limitate la faptele dictate și au dovezi", () => {
    const result = validateCall(call);
    expect(result?.changes.find(c => c.field === "cities")?.value).toEqual(["Cluj"]);
    expect(result?.changes.some(c => c.field === "wants_parking")).toBe(false);
    expect(result?.changes.find(c => c.field === "rooms_min")?.value).toBe(3);
    expect(result?.changes.every(c => c.evidence && transcript.includes(c.evidence))).toBe(true);
  });
  it("activitatea și data follow-up provin din transcript", () => {
    expect(validateCall(call)?.activity).toBe(call.activity);
    expect(validateCall(call)?.followup?.date).toBe("2026-11-25");
    expect(validateCall({ ...call, activity: "Are trei copii" })?.activity).toBeNull();
    expect(validateCall({ ...call, followup: { excerpt: "Sun mâine.", date: "2027-01-01" } })?.followup).toBeNull();
    expect(dateFromEvidence("pe 31.02.2026")).toBeNull();
  });
  it("pasul următor fără dată rămâne de confirmat, fără dată inventată", () => {
    expect(validateCall({ ...call, transcript: "Revin cu telefon.", followup: { excerpt: "Revin cu telefon.", date: null } })?.followup).toEqual({ excerpt: "Revin cu telefon.", date: null });
  });
  it("fără confirmare individuală nu există modificări de cerere", () => {
    expect(confirmedChanges(transcript, call.request, [], {})).toEqual([]);
    expect(confirmedChanges(transcript, call.request, ["rooms_min"], {})).toEqual([expect.objectContaining({ field: "rooms_min", value: 3 })]);
  });
});