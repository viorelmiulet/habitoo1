import { Mail } from "lucide-react";
import type { SubscriptionEmailEvidence } from "@/lib/subscription-request-email";
import { formatDateTime } from "@/lib/format";

export function SubscriptionEmailStatus({ email }: { email?: SubscriptionEmailEvidence | null }) {
  if (!email) return <p className="mt-2 text-xs text-muted-foreground">Fără confirmare de email înregistrată.</p>;
  return <details className="mt-2 max-w-sm text-xs"><summary className="cursor-pointer text-muted-foreground"><Mail className="mr-1 inline size-3" />{email.status === "sent" ? `Email trimis · ${formatDateTime(email.sentAt)}` : email.status === "suppressed" ? "Email netrimis: destinatarul nu primește emailuri" : "Email netrimis · cererea rămâne înregistrată"}</summary><div className="mt-2 space-y-2 break-words border-l border-border pl-3"><p>Către: {email.to}</p><p className="font-semibold">{email.subject}</p><p className="whitespace-pre-wrap">{email.text}</p></div></details>;
}