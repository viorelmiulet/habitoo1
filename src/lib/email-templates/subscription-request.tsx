import { Text } from "@react-email/components";
import { HabitooEmail } from "./habitoo-email";
import type { TemplateEntry } from "./registry";
import { subscriptionEmailContent, type SubscriptionEmailData } from "../subscription-request-email";
import { planPriceLabel } from "../plans";

function SubscriptionRequestEmail(props: Partial<SubscriptionEmailData>) {
  const data = { requestId: "", agency: "Agenție", plan: "pro", term: "12m", requester: "Administrator agenție", note: "", ...props };
  const content = subscriptionEmailContent(data);
  return <HabitooEmail preview={content.subject} heading="Cerere nouă de abonament" actionLabel="Vezi cererea" actionUrl={content.url} footer="Primești acest email deoarece o agenție a solicitat activarea abonamentului Habitoo.">
    <Text>{data.agency}</Text><Text>{planPriceLabel(data.plan, data.term)}</Text><Text>Solicitant: {data.requester}</Text>{data.note ? <Text style={{ whiteSpace: "pre-wrap" }}>Notă: {data.note}</Text> : null}
  </HabitooEmail>;
}
export const template = {
  component: SubscriptionRequestEmail,
  subject: data => subscriptionEmailContent(data as SubscriptionEmailData).subject,
  displayName: "Cerere abonament",
  previewData: { requestId: "preview", agency: "Agenție demonstrativă", plan: "pro", term: "12m", requester: "Administrator agenție", note: "Activare abonament anual" },
} satisfies TemplateEntry;