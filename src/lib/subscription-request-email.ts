import { planLabel, planPriceLabel } from "./plans";
import { paidTermLabel } from "./subscription-requests";

export interface SubscriptionEmailData {
  requestId: string;
  agency: string;
  plan: string;
  term: string;
  requester: string;
  note: string;
}
export interface SubscriptionEmailEvidence {
  status: "sent" | "failed" | "suppressed";
  sentAt: string | null;
  to: string;
  subject: string;
  text: string;
}
export function subscriptionEmailContent(data: SubscriptionEmailData) {
  const subject = `Cerere abonament: ${data.agency} – ${planLabel(data.plan)} ${paidTermLabel(data.term)}`;
  const url = `https://crm.habitoo.ro/superadmin/cereri-abonament?request=${encodeURIComponent(data.requestId)}`;
  const text = `${subject}\n\nSolicitant: ${data.requester}\nPreț: ${planPriceLabel(data.plan, data.term)}\n${data.note ? `Notă: ${data.note}\n` : ""}\nVezi cererea: ${url}`;
  return { subject, url, text };
}
export async function sendSubscriptionEmail(data: SubscriptionEmailData, to: string, deps: {
  send: (data: SubscriptionEmailData, to: string, key: string) => Promise<{ sent: boolean }>;
  save: (evidence: SubscriptionEmailEvidence) => Promise<void>;
  now: () => string;
}) {
  const content = subscriptionEmailContent(data);
  let status: SubscriptionEmailEvidence["status"];
  try {
    status = (await deps.send(data, to, `subscription-request-${data.requestId}`)).sent ? "sent" : "suppressed";
  } catch {
    status = "failed";
  }
  const evidence: SubscriptionEmailEvidence = { status, sentAt: status === "sent" ? deps.now() : null, to, subject: content.subject, text: content.text };
  await deps.save(evidence);
  return evidence;
}