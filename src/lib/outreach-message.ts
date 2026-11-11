import { z } from "zod";

/** Browser-safe: validation and rendering of outreach messages (no sending). */
export const OUTREACH_PUBLIC_ORIGIN = "https://www.habitoo.ro";
export const OUTREACH_SENDER_ADDRESS = "contact@habitoo.ro";
export const outreachMergeFields = ["agency_name", "city", "unsubscribe_url"] as const;
const MERGE = /\{\{\s*([^{}]*?)\s*\}\}/g;

export const campaignSchema = z.object({
  name: z.string().trim().min(1, "Numele campaniei este obligatoriu.").max(160),
  subject: z.string().trim().min(1, "Subiectul este obligatoriu.").max(200).refine((v) => !/[\r\n]/.test(v), "Subiectul nu poate avea mai multe rânduri."),
  body_text: z.string().trim().min(1, "Mesajul este obligatoriu.").max(20000),
  sender_name: z.string().trim().min(1, "Numele expeditorului este obligatoriu.").max(80).refine((v) => !/[\r\n<>"]/.test(v), "Numele expeditorului conține caractere nepermise."),
  footer_text: z.string().trim().min(1, "Textul de subsol este obligatoriu.").max(2000),
  status: z.enum(["draft", "ready"]).default("draft"),
});
export type CampaignInput = z.infer<typeof campaignSchema>;
export type MergeRecipient = { agency_name: string | null; city: string | null; unsubscribe_token: string };

export function unknownMergeFields(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(MERGE)) if (!(outreachMergeFields as readonly string[]).includes(m[1])) out.add(m[1] || "(gol)");
  return [...out];
}

/** Error message or null; unknown merge fields and an empty footer block saving. */
export function validateCampaign(input: unknown): { ok: true; value: CampaignInput } | { ok: false; error: string } {
  const parsed = campaignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Date invalide." };
  const unknown = [...new Set([parsed.data.subject, parsed.data.body_text, parsed.data.footer_text].flatMap(unknownMergeFields))];
  if (unknown.length) return { ok: false, error: `Câmpuri necunoscute: ${unknown.map((f) => `{{${f}}}`).join(", ")}. Folosește doar ${outreachMergeFields.map((f) => `{{${f}}}`).join(", ")}.` };
  return { ok: true, value: parsed.data };
}

export const unsubscribePageUrl = (token: string) => `${OUTREACH_PUBLIC_ORIGIN}/dezabonare/${encodeURIComponent(token)}`;
export const oneClickUrl = (token: string) => `${OUTREACH_PUBLIC_ORIGIN}/api/public/outreach/unsubscribe?token=${encodeURIComponent(token)}`;

function merge(text: string, r: MergeRecipient): string {
  const values: Record<string, string> = { agency_name: r.agency_name ?? "", city: r.city ?? "", unsubscribe_url: unsubscribePageUrl(r.unsubscribe_token) };
  return text.replace(MERGE, (all, key: string) => (key in values ? values[key] : all));
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
/** Paragraphs, line breaks and clickable links; no images, no tracking, no rewriting. */
export function textToHtml(text: string): string {
  const paras = text.replace(/\r\n/g, "\n").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const body = paras.map((p) => `<p>${escapeHtml(p).replace(/https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]/g, (u) => `<a href="${u}">${u}</a>`).replace(/\n/g, "<br>")}</p>`).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1f2937">\n${body}\n</body></html>`;
}

export type RenderedMessage = { from: string; subject: string; text: string; html: string; headers: Record<string, string> };
export function renderCampaign(c: Pick<CampaignInput, "subject" | "body_text" | "sender_name" | "footer_text">, r: MergeRecipient): RenderedMessage {
  const body = merge(c.body_text.trim(), r);
  const footer = merge(c.footer_text.trim(), r);
  const text = `${body}\n\n${footer}\nDezabonare: ${unsubscribePageUrl(r.unsubscribe_token)}`;
  return {
    from: `${c.sender_name.trim()} <${OUTREACH_SENDER_ADDRESS}>`,
    subject: merge(c.subject.trim(), r).replace(/[\r\n]+/g, " "),
    text,
    html: textToHtml(text),
    headers: { "List-Unsubscribe": `<${oneClickUrl(r.unsubscribe_token)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

export type TestSendDeps = {
  loadCampaign: (id: string) => Promise<(CampaignInput & { list_id: string }) | null>;
  firstRecipient: (listId: string) => Promise<MergeRecipient | null>;
  take: (campaignId: string, to: string) => Promise<boolean>;
  send: (msg: RenderedMessage & { to: string }) => Promise<{ ok: boolean; error?: string }>;
};
/** Sends one rendered message to one test address. Never touches recipients or suppressions. */
export async function runTestSend(deps: TestSendDeps, campaignId: string, to: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const address = to.trim().toLowerCase();
  if (!z.string().max(254).email().safeParse(address).success) return { ok: false, error: "Adresa de test nu este validă." };
  const campaign = await deps.loadCampaign(campaignId);
  if (!campaign) return { ok: false, error: "Campania nu există." };
  const valid = validateCampaign(campaign);
  if (!valid.ok) return valid;
  const recipient = await deps.firstRecipient(campaign.list_id);
  if (!recipient) return { ok: false, error: "Lista nu are destinatari pentru câmpurile de completare." };
  if (!(await deps.take(campaignId, address))) return { ok: false, error: "Limita de 10 trimiteri de test pe oră a fost atinsă." };
  const result = await deps.send({ ...renderCampaign(valid.value, recipient), to: address });
  return result.ok ? { ok: true } : { ok: false, error: result.error ?? "Trimiterea nu a reușit." };
}
