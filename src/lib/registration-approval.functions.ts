// Aprobarea unei cereri de înscriere agenție.
// Rulează pe server: RPC-ul tranzacțional creează organizația/profilul/rolul,
// apoi trimitem automat emailul de confirmare către solicitant.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AuthContext = {
  supabase: {
    rpc: (
      fn: "is_superadmin" | "approve_registration_request",
      args?: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
  userId: string;
};

export type ApproveRegistrationResult = {
  ok: true;
  organizationId: string | null;
  emailSent: boolean;
};

export const approveRegistrationRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ requestId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<ApproveRegistrationResult> => {
    const ctx = context as AuthContext;

    const { data: isSuper, error: roleError } = await ctx.supabase.rpc("is_superadmin");
    if (roleError || isSuper !== true) {
      throw new Error("Acces refuzat: acțiunea este permisă exclusiv superadminului.");
    }

    // 1. Aprobarea propriu-zisă (tranzacție SQL: organizație + profil + rol + audit).
    const { error: approveError } = await ctx.supabase.rpc("approve_registration_request", {
      _request_id: data.requestId,
    });
    if (approveError) throw new Error(approveError.message);

    // 2. Citim datele cererii pentru email (service role — cererea e deja aprobată).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: request, error: requestError } = await supabaseAdmin
      .from("agency_registration_requests")
      .select("email, full_name, agency_name, organization_id")
      .eq("id", data.requestId)
      .single();
    if (requestError) throw new Error(requestError.message);

    // 3. Emailul de confirmare — best-effort; aprobarea nu se anulează dacă emailul pică.
    let emailSent = false;
    try {
      const apiKey = process.env["LOVABLE_API_KEY"];
      if (apiKey && request.email) {
        const [{ sendLovableEmail }, { render }, { AgencyApprovedEmail }] = await Promise.all([
          import("@lovable.dev/email-js"),
          import("@react-email/render"),
          import("@/lib/email-templates/agency-approved"),
        ]);
        const React = await import("react");
        const appUrl = "https://crm.habitoo.ro/app";
        const element = React.createElement(AgencyApprovedEmail, {
          siteName: "Habitoo CRM",
          appUrl,
          agencyName: request.agency_name,
          fullName: request.full_name,
        });
        const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);

        await sendLovableEmail(
          {
            to: request.email,
            from: "Habitoo CRM <noreply@habitoo.ro>",
            sender_domain: "notify.habitoo.ro",
            subject: `Agenția ${request.agency_name} a fost aprobată — bine ai venit în Habitoo`,
            html,
            text,
            idempotency_key: `registration-approved-${data.requestId}`,
          },
          { apiKey, sendUrl: process.env["LOVABLE_SEND_URL"] },
        );
        emailSent = true;
      }
    } catch (e) {
      console.error("[registration] approval email failed", e);
    }

    return { ok: true, organizationId: request.organization_id, emailSent };
  });
