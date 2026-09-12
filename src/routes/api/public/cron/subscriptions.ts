// Verificarea zilnică a abonamentelor: tranzițiile activ -> grație -> suspendat
// se fac în baza de date (`subscription_enforce_daily`), iar această rută trimite
// emailurile brandate pentru agențiile intrate azi în grație.
// Apelantul este autentificat cu secretul de cron generat de platformă.
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { GRACE_DAYS } from "@/lib/subscription";

type GraceOrg = { id: string; name: string; expires_at: string; is_trial?: boolean };

async function sendGraceEmails(orgs: GraceOrg[]) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey || orgs.length === 0) return { emailsSent: 0 };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ sendLovableEmail }, { render }, { SubscriptionGraceEmail }] = await Promise.all([
    import("@lovable.dev/email-js"),
    import("@react-email/render"),
    import("@/lib/email-templates/subscription-grace"),
  ]);
  const React = await import("react");

  let emailsSent = 0;
  for (const org of orgs) {
    const { data: admins } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("organization_id", org.id)
      .eq("role", "agency_admin");
    const ids = Array.from(new Set((admins ?? []).map((r) => r.user_id)));
    if (ids.length === 0) continue;

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id,email,full_name")
      .in("id", ids);

    for (const profile of profiles ?? []) {
      if (!profile.email) continue;
      const element = React.createElement(SubscriptionGraceEmail, {
        siteName: "Habitoo CRM",
        appUrl: "https://crm.habitoo.ro/app",
        agencyName: org.name,
        fullName: profile.full_name ?? undefined,
        expiresAt: new Date(org.expires_at).toLocaleDateString("ro-RO"),
        graceDays: GRACE_DAYS,
        isTrial: org.is_trial === true,
      });
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      try {
        await sendLovableEmail(
          {
            to: profile.email,
            from: "Habitoo CRM <noreply@habitoo.ro>",
            sender_domain: "notify.habitoo.ro",
            subject:
              org.is_trial === true
                ? `Perioada gratuită a agenției ${org.name} s-a încheiat — ${GRACE_DAYS} zile până la suspendare`
                : `Abonamentul agenției ${org.name} a expirat — ${GRACE_DAYS} zile până la suspendare`,
            html,
            text,
            purpose: "transactional",
            idempotency_key: `subscription-grace-${org.id}-${org.expires_at}-${profile.id}`,
          },
          { apiKey },
        );
        emailsSent += 1;
      } catch {
        // Emailul este best-effort: notificarea din aplicație și banda rămân valabile.
      }
    }
  }
  return { emailsSent };
}

/**
 * Autentificarea apelantului: fie secretul de cron al platformei (Bearer), fie
 * un jeton de unică folosință emis chiar de jobul din baza de date. Ambele cer
 * un acces privilegiat pe care un apelant public nu îl are.
 */
async function authenticate(request: Request): Promise<Response | null> {
  const nonce = request.headers.get("x-cron-nonce");
  if (nonce) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.rpc("cron_nonce_claim", {
      _purpose: "subscriptions",
      _token: nonce,
    });
    if (data === true) return null;
    return new Response("Unauthorized", { status: 401 });
  }
  return authenticateCronRequest(request);
}

export const Route = createFileRoute("/api/public/cron/subscriptions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauthorized = await authenticate(request);
        if (unauthorized) return unauthorized;

        // Jobul din bază face deja tranzițiile și notificările în aplicație, apoi
        // apelează ruta doar pentru emailuri, cu lista agențiilor intrate în grație.
        const payload = (await request.json().catch(() => ({}))) as {
          emailsOnly?: boolean;
          grace?: GraceOrg[];
        };
        if (payload.emailsOnly === true) {
          const { emailsSent } = await sendGraceEmails(payload.grace ?? []);
          return new Response(JSON.stringify({ ok: true, emailsOnly: true, emailsSent }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("subscription_enforce_daily");
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const result = (data ?? {}) as { grace?: GraceOrg[]; suspended?: { id: string }[] };
        const { emailsSent } = await sendGraceEmails(result.grace ?? []);

        return new Response(
          JSON.stringify({
            ok: true,
            grace: (result.grace ?? []).length,
            suspended: (result.suspended ?? []).length,
            emailsSent,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
