/**
 * Emailuri pentru mesajele de chat necitite de 15 minute. Selecția și marcarea
 * (maximum unul pe conversație pe oră) se fac atomic în `chat_email_claim`.
 * Armat la trimiterea unui mesaj, dezarmat când nu mai există mesaje în așteptare.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

async function authenticate(request: Request): Promise<Response | null> {
  const nonce = request.headers.get("x-cron-nonce");
  if (nonce) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.rpc("cron_nonce_claim", {
      _purpose: "chat_email",
      _token: nonce,
    });
    if (data === true) return null;
    return new Response("Unauthorized", { status: 401 });
  }
  return authenticateCronRequest(request);
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export const Route = createFileRoute("/api/public/cron/chat-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticate(request);
        if (unauthorized) return unauthorized;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: due, error } = await supabaseAdmin.rpc("chat_email_claim");
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
        }
        const apiKey = process.env["LOVABLE_API_KEY"];
        let sent = 0;
        if (apiKey && due?.length) {
          const { sendLovableEmail } = await import("@lovable.dev/email-js");
          const ids = [...new Set(due.flatMap((d) => [d.recipient_id, d.sender_id]))];
          const { data: profiles } = await supabaseAdmin
            .from("profiles")
            .select("id,email,full_name,organization_id")
            .in("id", ids);
          const orgIds = [...new Set((profiles ?? []).map((p) => p.organization_id).filter(Boolean))];
          const { data: orgs } = await supabaseAdmin
            .from("organizations")
            .select("id,name")
            .in("id", orgIds as string[]);
          const { data: admins } = await supabaseAdmin
            .from("user_roles")
            .select("user_id")
            .eq("role", "superadmin")
            .in("user_id", ids);
          const platform = new Set((admins ?? []).map((a) => a.user_id));
          const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
          const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]));
          for (const d of due) {
            const to = byId.get(d.recipient_id);
            const from = byId.get(d.sender_id);
            if (!to?.email || !from) continue;
            const name = from.full_name || "un agent";
            const agency = platform.has(from.id)
              ? "Admin platformă"
              : (from.organization_id && orgName.get(from.organization_id)) || "Habitoo");
            const subject = `Ai un mesaj nou de la ${name}, ${agency}`;
            const text = `${subject}.\n\nDeschide Habitoo CRM pentru a răspunde: https://crm.habitoo.ro/app`;
            const html = `<p>${esc(subject)}.</p><p><a href="https://crm.habitoo.ro/app">Deschide Habitoo CRM</a> pentru a răspunde.</p>`;
            try {
              await sendLovableEmail(
                {
                  to: to.email,
                  from: "Habitoo CRM <noreply@habitoo.ro>",
                  sender_domain: "notify.habitoo.ro",
                  subject,
                  html,
                  text,
                  purpose: "transactional",
                  idempotency_key: `chat-${d.conversation_id}-${d.recipient_id}-${new Date().toISOString().slice(0, 13)}`,
                },
                { apiKey },
              );
              sent += 1;
            } catch {
              // best-effort: mesajul rămâne necitit în aplicație
            }
          }
        }
        return new Response(JSON.stringify({ ok: true, due: due?.length ?? 0, sent }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
