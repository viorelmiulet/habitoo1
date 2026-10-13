/**
 * Emailuri pentru mesajele de chat necitite de 15 minute. Selecția și marcarea
 * (maximum unul pe conversație pe oră) se fac atomic în `chat_email_claim`.
 * Armat la trimiterea unui mesaj, dezarmat când nu mai există mesaje în așteptare.
 */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { CHAT_EMAIL_IMAGE_TTL, chatConversationUrl } from "@/lib/chat/email-data";
import { chatEmailProps, chatEmailText, renderHabitooEmail } from "@/lib/email-templates/habitoo-email";

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
            .select("id,email,full_name,organization_id,avatar_url")
            .in("id", ids);
          const orgIds = [...new Set((profiles ?? []).map((p) => p.organization_id).filter(Boolean))];
          const { data: orgs } = await supabaseAdmin
            .from("organizations")
            .select("id,name,logo_path")
            .in("id", orgIds as string[]);
          const { data: admins } = await supabaseAdmin
            .from("user_roles")
            .select("user_id")
            .eq("role", "superadmin")
            .in("user_id", ids);
          const platform = new Set((admins ?? []).map((a) => a.user_id));
          const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
          const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]));
          const orgLogo = new Map((orgs ?? []).map((o) => [o.id, o.logo_path]));
          // Images stay private; failures fall back to initials or agency text.
          const imageUrls = new Map<string, string | null>();
          const emailImage = async (bucket: string, path?: string | null) => {
            if (!path) return null;
            const key = `${bucket}:${path}`;
            if (imageUrls.has(key)) return imageUrls.get(key) ?? null;
            try {
              const { data, error: imageError } = await supabaseAdmin.storage.from(bucket)
                .createSignedUrl(path, CHAT_EMAIL_IMAGE_TTL);
              const url = imageError ? null : data?.signedUrl ?? null;
              imageUrls.set(key, url);
              return url;
            } catch {
              imageUrls.set(key, null);
              return null;
            }
          };
          for (const d of due) {
            const to = byId.get(d.recipient_id);
            const from = byId.get(d.sender_id);
            if (!to?.email || !from) continue;
            const name = from.full_name || "un agent";
            const agency = platform.has(from.id)
              ? "Admin platformă"
              : (from.organization_id && orgName.get(from.organization_id)) || "Habitoo";
            const subject = `Ai un mesaj nou de la ${name}, ${agency}`;
            try {
              // Current unread content, without changing the atomic claim or frequency.
              const { data: participant, error: participantError } = await supabaseAdmin
                .from("chat_participants").select("last_read_at")
                .eq("conversation_id", d.conversation_id).eq("user_id", d.recipient_id).maybeSingle();
              if (participantError || !participant) continue;
              const { data: messages, count, error: messageError } = await supabaseAdmin
                .from("chat_messages").select("body", { count: "exact" })
                .eq("conversation_id", d.conversation_id).eq("sender_id", d.sender_id)
                .gt("created_at", participant.last_read_at)
                .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1);
              const message = messages?.[0];
              if (messageError || !message) continue;
              const [avatarUrl, agencyLogoUrl] = await Promise.all([
                emailImage("avatars", from.avatar_url),
                emailImage("agency-logos", platform.has(from.id) || !from.organization_id ? null : orgLogo.get(from.organization_id)),
              ]);
              const emailData = {
                senderName: name, agencyName: agency, avatarUrl, agencyLogoUrl,
                message: message.body, unreadCount: count ?? d.message_count,
                conversationUrl: chatConversationUrl(d.conversation_id, platform.has(to.id)),
              };
              const html = await renderHabitooEmail(chatEmailProps(emailData));
              const text = chatEmailText(emailData, subject);
              // Lovable appends the existing hosted unsubscribe footer.
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
