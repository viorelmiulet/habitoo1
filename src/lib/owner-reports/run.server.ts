/**
 * Orchestrarea raportului de proprietar, cu dependențe injectate (testabilă).
 * Generarea creează o ciornă; trimiterea pleacă doar la acțiunea agentului
 * sau, cu „Trimite automat”, din lucrătorul de la 09:00.
 */
import { z } from "zod";
import type { AIProvider } from "@/lib/ai/providers/types";
import {
  buildReportData, reportLines, shortReportText, templateNarrative, validateNarrative,
  type OwnerReportData, type OwnerReportNarrative, type RawReportInput,
} from "./report";

export type ReportTarget = { property_id: string; organization_id: string; auto_send: boolean };
export type LoadedRaw = { raw: RawReportInput; forbiddenNames: string[]; feedbackNotes: string[]; ownerContactId: string | null; agentId: string | null; logo: Uint8Array | null };

export type GenerateDeps = {
  claim: (t: ReportTarget, week: { start: string; end: string }) => Promise<string | null>;
  loadRaw: (t: ReportTarget, week: { start: string; end: string }) => Promise<LoadedRaw | null>;
  isFeatureEnabled: (org: string) => Promise<boolean>;
  creditsBlocked: (org: string) => Promise<string | null>;
  withCredits: <T>(actor: { organizationId: string; userId: string }, run: () => Promise<T>, ok: (r: T) => boolean) => Promise<T>;
  provider: Pick<AIProvider, "generate"> | null;
  renderPdf: (d: OwnerReportData, n: OwnerReportNarrative, logo: Uint8Array | null) => Promise<Uint8Array>;
  savePdf: (reportId: string, bytes: Uint8Array) => Promise<string>;
  finalize: (reportId: string, patch: Record<string, unknown>) => Promise<void>;
  release: (reportId: string) => Promise<void>;
  notify: (n: { organizationId: string; userId: string; title: string; body: string; link: string }) => Promise<void>;
};

const narrativeSchema = z.object({ intro: z.string().max(800), conclusion: z.string().max(800), recommendation: z.string().max(600) });

export const OWNER_REPORT_SYSTEM = `Ești asistentul Habitoo pentru agenți imobiliari din România. Scrii în română textul unui raport săptămânal către proprietarul unei locuințe.
Răspunde DOAR cu JSON: {"intro":string,"conclusion":string,"recommendation":string}.
Reguli: folosește DOAR cifrele primite, fără alte numere, procente sau estimări. Nu menționa nume, telefoane sau emailuri de clienți. "recommendation": dacă "recomandare" este "price_adjust", recomanzi politicos discutarea unei ajustări de preț; altfel recomanzi continuarea promovării, fără să sugerezi schimbarea prețului. Ton profesionist și cald, 1–3 fraze pe câmp.`;

export function redactNames(text: string, names: string[]) {
  let out = text;
  for (const name of names) for (const tok of name.split(/\s+/)) if (tok.length >= 3) out = out.replace(new RegExp(tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu"), "clientul");
  return out;
}

export async function composeNarrative(deps: Pick<GenerateDeps, "isFeatureEnabled" | "creditsBlocked" | "withCredits" | "provider">, data: OwnerReportData, loaded: Pick<LoadedRaw, "forbiddenNames" | "feedbackNotes">, actor: { organizationId: string; userId: string }) {
  const template = templateNarrative(data);
  if (!deps.provider || !(await deps.isFeatureEnabled(actor.organizationId))) return { narrative: template, isAi: false, notice: null as string | null };
  const blocked = await deps.creditsBlocked(actor.organizationId);
  if (blocked) return { narrative: template, isAi: false, notice: blocked };
  const facts = {
    proprietate: data.property.title,
    saptamana: `${data.week.start} – ${data.week.end}`,
    cifre: reportLines(data),
    recomandare: data.recommendation,
    feedback_vizionari: loaded.feedbackNotes.map((n) => redactNames(n, loaded.forbiddenNames).slice(0, 300)),
  };
  try {
    const result = await deps.withCredits(actor, async () => {
      const r = await deps.provider!.generate({ system: OWNER_REPORT_SYSTEM, messages: [{ role: "user", content: JSON.stringify(facts) }], tools: [], maxOutputTokens: 1200 });
      const json = r.text.slice(r.text.indexOf("{"), r.text.lastIndexOf("}") + 1);
      const parsed = narrativeSchema.safeParse((() => { try { return JSON.parse(json); } catch { return null; } })());
      return parsed.success && validateNarrative(parsed.data, data, loaded.forbiddenNames) ? parsed.data : null;
    }, (r) => r !== null);
    return result ? { narrative: result, isAi: true, notice: null } : { narrative: template, isAi: false, notice: "Textul AI nu a trecut verificarea; raportul folosește textul standard." };
  } catch (e) {
    const { AiCreditsExhaustedError } = await import("@/lib/ai/credits/credits");
    return { narrative: template, isAi: false, notice: e instanceof AiCreditsExhaustedError ? e.message : "Textul AI nu a putut fi generat; raportul folosește textul standard." };
  }
}

/** O singură generare pe proprietate și săptămână (slotul unic din baza de date). */
export async function generateOwnerReport(deps: GenerateDeps, t: ReportTarget, week: { start: string; end: string }): Promise<"created" | "duplicate" | "skipped"> {
  if (!(await deps.isFeatureEnabled(t.organization_id))) return "skipped";
  const reportId = await deps.claim(t, week);
  if (!reportId) return "duplicate";
  try {
    const loaded = await deps.loadRaw(t, week);
    if (!loaded) { await deps.finalize(reportId, { status: "skipped", send_error: "Proprietatea nu mai este eligibilă." }); return "skipped"; }
    const data = buildReportData(loaded.raw);
    const actor = { organizationId: t.organization_id, userId: (loaded.agentId ?? null) as string };
    const { narrative, isAi, notice } = await composeNarrative(deps, data, loaded, actor);
    const pdf = await deps.renderPdf(data, narrative, loaded.logo);
    const path = await deps.savePdf(reportId, pdf);
    await deps.finalize(reportId, { data, narrative, is_ai: isAi, short_text: shortReportText(data, null), pdf_path: path, auto_send: t.auto_send, owner_contact_id: loaded.ownerContactId, agent_id: loaded.agentId });
    if (loaded.agentId) {
      await deps.notify({
        organizationId: t.organization_id, userId: loaded.agentId,
        title: `Raportul săptămânal pentru ${data.property.title} e gata`,
        body: [t.auto_send ? "Se trimite automat proprietarului la 09:00, dacă nu îl oprești." : "Verifică-l și trimite-l proprietarului.", notice ? `Fără text AI: ${notice}` : null].filter(Boolean).join(" "),
        link: `/app/properties/${t.property_id}?tab=owner-reports`,
      });
    }
    return "created";
  } catch (e) {
    await deps.release(reportId);
    throw e;
  }
}

export type SendDeps = {
  lockDraft: (reportId: string) => Promise<{ id: string; organization_id: string; property_id: string; owner_contact_id: string | null; agent_id: string | null; pdf_path: string | null; data: OwnerReportData; narrative: OwnerReportNarrative } | null>;
  unlock: (reportId: string, error: string) => Promise<void>;
  loadRecipients: (ownerId: string, agentId: string | null) => Promise<{ ownerEmail: string | null; ownerFirstName: string | null; agentEmail: string | null }>;
  loadPdf: (path: string) => Promise<Uint8Array | null>;
  sendEmail: (m: { to: string; replyTo: string | null; subject: string; text: string; html: string; attachment: { filename: string; data: Uint8Array }; sendKey: string }) => Promise<{ ok: boolean; error?: string }>;
  markSent: (reportId: string, by: string | null, via: string) => Promise<void>;
  logActivity: (r: { organizationId: string; propertyId: string; contactId: string | null; agentId: string | null; title: string; description: string }) => Promise<void>;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function ownerEmailBody(d: OwnerReportData, n: OwnerReportNarrative, firstName: string | null) {
  const paras = [firstName ? `Bună ziua, ${firstName},` : "Bună ziua,", n.intro, ...reportLines(d).map((l) => `• ${l.label}: ${l.value}`), n.conclusion, n.recommendation, "Raportul complet este atașat în format PDF.", `${d.agent.name}${d.agent.phone ? ` · ${d.agent.phone}` : ""}\n${d.agency.name}`];
  return { text: paras.join("\n\n"), html: paras.map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("") };
}

/** Trimite ciorna o singură dată (blocare pe status), cu PDF atașat și Reply-To agentului. */
export async function sendOwnerReport(deps: SendDeps, reportId: string, by: { userId: string | null; via: "email" | "auto" }): Promise<{ ok: boolean; message?: string }> {
  const r = await deps.lockDraft(reportId);
  if (!r) return { ok: false, message: "Raportul nu mai este o ciornă de trimis." };
  try {
    if (!r.owner_contact_id) throw new Error("Proprietarul nu are date de contact.");
    const rec = await deps.loadRecipients(r.owner_contact_id, r.agent_id);
    if (!rec.ownerEmail) throw new Error("Proprietarul nu are email.");
    const pdf = r.pdf_path ? await deps.loadPdf(r.pdf_path) : null;
    if (!pdf) throw new Error("PDF-ul raportului lipsește.");
    const body = ownerEmailBody(r.data, r.narrative, rec.ownerFirstName);
    const res = await deps.sendEmail({ to: rec.ownerEmail, replyTo: rec.agentEmail, subject: `Raport săptămânal: ${r.data.property.title}`, ...body, attachment: { filename: `raport-${r.data.week.start}.pdf`, data: pdf }, sendKey: `owner-report-${r.id}` });
    if (!res.ok) throw new Error(res.error ?? "Emailul nu a putut fi trimis.");
    await deps.markSent(r.id, by.userId, by.via);
    await deps.logActivity({ organizationId: r.organization_id, propertyId: r.property_id, contactId: r.owner_contact_id, agentId: r.agent_id, title: "Raport săptămânal trimis proprietarului", description: `Săptămâna ${r.data.week.start} – ${r.data.week.end}, ${by.via === "auto" ? "trimis automat" : "trimis pe email"}.` });
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Trimiterea a eșuat.";
    await deps.unlock(reportId, message);
    return { ok: false, message };
  }
}
