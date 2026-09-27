import { Facebook, Mail, MessageCircle, Phone } from "lucide-react";
import {
  CONTACT_EMAIL,
  CONTACT_PHONE,
  CONTACT_PHONE_DISPLAY,
  FACEBOOK_URL,
  WHATSAPP_URL,
} from "./structured-data";

/** Canalele de contact directe, randate în HTML-ul de pe server. */
export function ContactChannels() {
  return (
    <div className="mt-8 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-navy">Contact direct</h2>
      <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Phone className="size-4 shrink-0 text-navy" aria-hidden />
        <span>
          Telefon / WhatsApp:{" "}
          <a href={`tel:${CONTACT_PHONE}`} className="font-medium text-navy hover:underline">
            {CONTACT_PHONE_DISPLAY}
          </a>
        </span>
      </p>
      <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
        <Mail className="size-4 shrink-0 text-navy" aria-hidden />
        <span>
          Email:{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="break-all font-medium text-navy hover:underline"
          >
            {CONTACT_EMAIL}
          </a>
        </span>
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-navy px-4 text-sm font-medium text-navy-foreground transition-colors hover:bg-navy/90"
        >
          <MessageCircle className="size-4" aria-hidden />
          Scrie-ne pe WhatsApp
        </a>
        <a
          href={FACEBOOK_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-medium text-navy transition-colors hover:bg-muted"
        >
          <Facebook className="size-4" aria-hidden />
          Habitoo pe Facebook
        </a>
      </div>
    </div>
  );
}
