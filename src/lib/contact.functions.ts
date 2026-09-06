import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const contactInterests = ["demo", "produs", "preturi", "altceva"] as const;

const interestLabels: Record<(typeof contactInterests)[number], string> = {
  demo: "Vreau o demonstrație",
  produs: "Întrebări despre produs",
  preturi: "Prețuri și planuri",
  altceva: "Altceva",
};

const contactRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .refine((v) => !v || /^[+0-9 ().-]{7,20}$/.test(v), "Număr de telefon invalid."),
  agency: z.string().trim().min(2).max(160),
  interest: z.enum(contactInterests),
  message: z.string().trim().min(10).max(4000),
  sourcePath: z.string().trim().max(300).optional(),
});

export type ContactRequestInput = z.infer<typeof contactRequestSchema>;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const submitContactRequest = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => contactRequestSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: inserted, error } = await supabaseAdmin
      .from("contact_requests")
      .insert({
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        agency: data.agency,
        interest: data.interest,
        message: data.message,
        source_path: data.sourcePath ?? null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[contact] insert failed", error.message);
      throw new Error("Nu am putut înregistra solicitarea. Te rugăm să încerci din nou.");
    }

    // Best-effort notification to the Habitoo team; the request is already stored.
    try {
      const apiKey = process.env["LOVABLE_API_KEY"];
      const inbox = process.env["CONTACT_INBOX"] ?? "contact@habitoo.ro";
      if (apiKey) {
        const { sendLovableEmail } = await import("@lovable.dev/email-js");
        const rows: Array<[string, string]> = [
          ["Nume", data.name],
          ["Email", data.email],
          ["Telefon", data.phone || "—"],
          ["Agenție", data.agency],
          ["Motiv", interestLabels[data.interest]],
          ["Pagina", data.sourcePath ?? "—"],
        ];
        const text = [
          ...rows.map(([k, v]) => `${k}: ${v}`),
          "",
          "Mesaj:",
          data.message,
        ].join("\n");
        const html = `<h2>Solicitare nouă din formularul de contact</h2><table cellpadding="6">${rows
          .map(([k, v]) => `<tr><td><strong>${k}</strong></td><td>${escapeHtml(v)}</td></tr>`)
          .join("")}</table><p><strong>Mesaj:</strong><br/>${escapeHtml(data.message).replace(
          /\n/g,
          "<br/>",
        )}</p>`;

        await sendLovableEmail(
          {
            to: inbox,
            from: "Habitoo CRM <noreply@habitoo.ro>",
            sender_domain: "notify.habitoo.ro",
            reply_to: data.email,
            subject: `Solicitare ${interestLabels[data.interest]} — ${data.agency}`,
            html,
            text,
            idempotency_key: `contact-${inserted.id}`,
          },
          { apiKey, sendUrl: process.env["LOVABLE_SEND_URL"] },
        );
      }
    } catch (e) {
      console.error("[contact] notification email failed", e);
    }

    return { ok: true as const, id: inserted.id as string };
  });
