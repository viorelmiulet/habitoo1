import { describe, expect, it, vi } from "vitest";
import { buildReportData, canAutoSend, previousWeek, reportLines, validateNarrative, type RawReportInput } from "./report";
import { generateOwnerReport, sendOwnerReport, type GenerateDeps, type SendDeps } from "./run.server";

vi.mock("@/lib/ai/credits/credits", () => ({ AiCreditsExhaustedError: class extends Error {} }));

const week = { start: "2026-11-02", end: "2026-11-08" };
function raw(over: Partial<RawReportInput> = {}): RawReportInput {
  return {
    week, property: { title: "Apartament 2 camere Militari", reference: "HB1", price: 80000, currency: "EUR", city: "București" },
    siteVisits: [], portalStats: [], publishedPortals: ["imobiliare"],
    leads: [{ source: "imobiliare" }, { source: "imobiliare" }, { source: "website" }],
    inboundMessages: 4,
    viewings: [{ status: "done", description: "Ion Popescu a zis că e luminos" }, { status: "planned", description: null }],
    acp: null, agent: { name: "Agent Test", phone: null, email: "a@x.ro" }, agency: { name: "Agenția Test", accent: null }, ...over,
  };
}
const loaded = (r = raw()) => ({ raw: r, forbiddenNames: ["Ion Popescu"], feedbackNotes: ["Ion Popescu a zis că e luminos"], ownerContactId: "c1", agentId: "u1", logo: null });

function genDeps(over: Partial<GenerateDeps> = {}) {
  const claimed = new Set<string>();
  const finalize = vi.fn(async () => {});
  const notify = vi.fn(async () => {});
  const deps: GenerateDeps = {
    claim: async (t, w) => { const k = `${t.property_id}:${w.start}`; if (claimed.has(k)) return null; claimed.add(k); return "r1"; },
    loadRaw: async () => loaded(),
    isFeatureEnabled: async () => true,
    creditsBlocked: async () => null,
    withCredits: async (_a, run) => run(),
    provider: { generate: vi.fn(async () => ({ text: JSON.stringify({ intro: "Săptămâna aceasta au fost 3 solicitări.", conclusion: "Au fost 2 vizionări.", recommendation: "Continuăm promovarea." }) })) } as never,
    renderPdf: async () => new Uint8Array([1]), savePdf: async () => "p.pdf", finalize, release: async () => {}, notify, ...over,
  };
  return { deps, finalize, notify };
}
const target = { property_id: "p1", organization_id: "o1", auto_send: false };

describe("raport proprietar", () => {
  it("3 lead-uri și 2 vizionări, fără nume de clienți", async () => {
    const d = buildReportData(raw());
    expect(d.leads.total).toBe(3);
    expect(d.viewings).toMatchObject({ done: 1, planned: 1 });
    const { deps, finalize } = genDeps();
    expect(await generateOwnerReport(deps, target, week)).toBe("created");
    const patch = (finalize.mock.calls[0] as unknown as [string, Record<string, unknown>])[1];
    expect(JSON.stringify(patch)).not.toMatch(/Popescu/);
    expect(patch.is_ai).toBe(true);
  });
  it("fără vizualizări: rândul lipsește", () => {
    const lines = reportLines(buildReportData(raw()));
    expect(lines.find((l) => l.label === "Vizualizări")).toBeUndefined();
  });
  it("cifră inventată sau nume → text AI respins", () => {
    const d = buildReportData(raw());
    expect(validateNarrative({ intro: "Au fost 57 vizualizări.", conclusion: "x", recommendation: "y" }, d, [])).toBe(false);
    expect(validateNarrative({ intro: "Ion a venit.", conclusion: "x", recommendation: "y" }, d, ["Ion Popescu"])).toBe(false);
  });
  it("Trimite automat cere email și consimțământ activ", () => {
    expect(canAutoSend({ email: null, gdpr_consent: true, gdpr_withdrawn_at: null })).toBe(false);
    expect(canAutoSend({ email: "o@x.ro", gdpr_consent: false, gdpr_withdrawn_at: null })).toBe(false);
    expect(canAutoSend({ email: "o@x.ro", gdpr_consent: true, gdpr_withdrawn_at: "2026-01-01" })).toBe(false);
    expect(canAutoSend({ email: "o@x.ro", gdpr_consent: true, gdpr_withdrawn_at: null })).toBe(true);
  });
  it("generarea creează ciornă și nu trimite email", async () => {
    const { deps, finalize, notify } = genDeps();
    await generateOwnerReport(deps, target, week);
    const patch = (finalize.mock.calls[0] as unknown as [string, Record<string, unknown>])[1];
    expect(patch.status).toBeUndefined();
    expect(patch.sent_via).toBeUndefined();
    expect(notify).toHaveBeenCalledOnce();
  });
  it("trimiterea are loc o singură dată pe ciornă", async () => {
    let locked = false;
    const sendEmail = vi.fn(async () => ({ ok: true }));
    const deps: SendDeps = {
      lockDraft: async () => { if (locked) return null; locked = true; return { id: "r1", organization_id: "o1", property_id: "p1", owner_contact_id: "c1", agent_id: "u1", pdf_path: "p.pdf", data: buildReportData(raw()), narrative: { intro: "a", conclusion: "b", recommendation: "c" } }; },
      unlock: async () => {}, loadRecipients: async () => ({ ownerEmail: "o@x.ro", ownerFirstName: "Ana", agentEmail: "a@x.ro" }),
      loadPdf: async () => new Uint8Array([1]), sendEmail, markSent: async () => {}, logActivity: vi.fn(async () => {}),
    };
    expect((await sendOwnerReport(deps, "r1", { userId: "u1", via: "email" })).ok).toBe(true);
    expect((await sendOwnerReport(deps, "r1", { userId: "u1", via: "email" })).ok).toBe(false);
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendEmail.mock.calls[0]).toBeDefined();
  });
  it("fără credite → șablon ne-AI și agent anunțat", async () => {
    const { deps, finalize, notify } = genDeps({ creditsBlocked: async () => "Ai folosit creditele AI" });
    await generateOwnerReport(deps, target, week);
    const patch = (finalize.mock.calls[0] as unknown as [string, Record<string, unknown>])[1];
    expect(patch.is_ai).toBe(false);
    expect((deps.provider!.generate as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect(JSON.stringify(notify.mock.calls[0])).toMatch(/Fără text AI/);
  });
  it("nu se dublează în aceeași săptămână", async () => {
    const { deps } = genDeps();
    expect(await generateOwnerReport(deps, target, week)).toBe("created");
    expect(await generateOwnerReport(deps, target, week)).toBe("duplicate");
  });
  it("săptămâna anterioară luni–duminică, ora României", () => {
    expect(previousWeek(new Date("2026-11-09T06:00:00Z"))).toEqual(week);
    expect(previousWeek(new Date("2026-11-08T22:30:00Z"))).toEqual(week);
  });
});
