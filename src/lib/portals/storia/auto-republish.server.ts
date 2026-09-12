/**
 * Republicarea automată a anunțurilor Storia expirate.
 *
 * OLX Group RE API nu are „auto-renew”: singurul semnal este statusul
 * `outdated` din notificarea de ciclu de viață. La primirea lui, Habitoo poate
 * republica anunțul, dar STRICT dacă agenția a bifat opțiunea
 * (`organizations.storia_auto_republish`, implicit dezactivată).
 *
 * Comportamentul implicit (comutator dezactivat) rămâne identic cu cel de
 * dinainte: statusul „expirat” în `portal_listings` + notificare pentru agent,
 * fără nicio acțiune automată.
 */

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

export type StoriaExpiryOutcome = {
  republished: boolean;
  /** Notă scurtă adăugată în `process_note` al evenimentului. */
  note: string;
};

const PORTAL_NAME = "Storia.ro";

/** Statusurile în care oferta mai poate fi publicată pe portaluri. */
const PUBLISHABLE_STATUSES = ["active", "reserved", "negotiation"];

export async function handleStoriaExpiry(
  admin: Admin,
  match: {
    organizationId: string;
    propertyId: string;
    propertyTitle: string;
    assignedTo: string | null;
  },
): Promise<StoriaExpiryOutcome> {
  const [{ data: org }, { data: property }, { data: publication }] = await Promise.all([
    admin
      .from("organizations")
      .select("id, name, storia_auto_republish")
      .eq("id", match.organizationId)
      .maybeSingle(),
    admin
      .from("properties")
      .select("id, title, status, publish_status, deleted_at, archived_at, storia_auto_renew")
      .eq("id", match.propertyId)
      .maybeSingle(),
    admin
      .from("portal_publications")
      .select("enabled")
      .eq("organization_id", match.organizationId)
      .eq("property_id", match.propertyId)
      .eq("portal_key", "storia")
      .maybeSingle(),
  ]);

  const autoEnabled = org?.storia_auto_republish === true;

  // Motivul pentru care republicarea nu este permisă (independent de comutator).
  let blocked: string | null = null;
  if (!property || property.deleted_at) blocked = "Oferta nu mai există în CRM.";
  else if (property.archived_at) blocked = "Oferta este arhivată.";
  else if (publication?.enabled === false) blocked = "Publicarea pe Storia a fost oprită manual.";
  else if (property.publish_status !== "published")
    blocked = "Oferta nu este marcată pentru publicare.";
  else if (!PUBLISHABLE_STATUSES.includes(property.status))
    blocked = "Statusul ofertei nu mai permite publicarea.";

  let republished = false;
  let note = autoEnabled
    ? (blocked ?? "republicare automată nereușită")
    : "auto-republicare dezactivată pentru agenție";

  if (autoEnabled && !blocked) {
    const { executeListingAction } = await import("@/lib/portals.functions");
    const result = await executeListingAction({
      organizationId: match.organizationId,
      actorId: null,
      portalId: "storia",
      propertyId: match.propertyId,
      action: "publish",
      operationLabel: "auto_republish",
    });
    republished = result.ok;
    note = result.ok
      ? "anunț expirat republicat automat pe Storia"
      : `republicarea automată a eșuat: ${result.message}`;
    if (!result.ok) blocked = "Republicarea automată a eșuat.";

    await admin.from("audit_logs").insert({
      organization_id: match.organizationId,
      action: republished ? "storia.auto_republish" : "storia.auto_republish_failed",
      entity: "properties",
      entity_id: match.propertyId,
      new_values: { portal: "storia", trigger: "advert_expired", note } as never,
    });
  }

  await notifyAgent(admin, {
    ...match,
    propertyTitle: property?.title ?? match.propertyTitle,
    organizationName: org?.name ?? "",
    republished,
    reason: republished ? null : blocked,
  });

  return { republished, note };
}

async function notifyAgent(
  admin: Admin,
  input: {
    organizationId: string;
    propertyId: string;
    propertyTitle: string;
    organizationName: string;
    assignedTo: string | null;
    republished: boolean;
    reason: string | null;
  },
) {
  const title = input.republished
    ? `Anunțul „${input.propertyTitle}” a expirat pe ${PORTAL_NAME} și a fost republicat automat`
    : `Anunțul „${input.propertyTitle}” a expirat pe ${PORTAL_NAME}`;
  const body = input.republished
    ? `Republicarea automată a fost făcută conform setării agenției.`
    : `Republică-l manual din fila Publicare.${input.reason ? ` ${input.reason}` : ""}`;

  const recipients = new Set<string>();
  if (input.assignedTo) recipients.add(input.assignedTo);
  if (recipients.size === 0) {
    const { data: admins } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("organization_id", input.organizationId)
      .eq("role", "agency_admin");
    for (const row of admins ?? []) recipients.add(row.user_id);
  }
  if (recipients.size === 0) return;

  const link = `/app/properties/${input.propertyId}`;
  for (const userId of recipients) {
    await admin.from("notifications").insert({
      organization_id: input.organizationId,
      user_id: userId,
      type: "portal",
      title,
      body,
      link,
    });
  }

  await sendExpiryEmails(admin, { ...input, recipients: [...recipients], title, link });
}

/** Emailul este best-effort: notificarea din aplicație rămâne sursa sigură. */
async function sendExpiryEmails(
  admin: Admin,
  input: {
    recipients: string[];
    propertyId: string;
    propertyTitle: string;
    republished: boolean;
    reason: string | null;
    title: string;
    link: string;
  },
) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return;

  try {
    const [{ sendLovableEmail }, { render }, { PortalListingExpiredEmail }] = await Promise.all([
      import("@lovable.dev/email-js"),
      import("@react-email/render"),
      import("@/lib/email-templates/portal-listing-expired"),
    ]);
    const React = await import("react");

    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, full_name")
      .in("id", input.recipients);

    for (const profile of profiles ?? []) {
      if (!profile.email) continue;
      const element = React.createElement(PortalListingExpiredEmail, {
        siteName: "Habitoo CRM",
        propertyUrl: `https://crm.habitoo.ro${input.link}`,
        propertyTitle: input.propertyTitle,
        portalName: PORTAL_NAME,
        fullName: profile.full_name ?? undefined,
        republished: input.republished,
        reason: input.reason ?? undefined,
      });
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      await sendLovableEmail(
        {
          to: profile.email,
          from: "Habitoo CRM <noreply@habitoo.ro>",
          sender_domain: "notify.habitoo.ro",
          subject: input.title,
          html,
          text,
          purpose: "transactional",
          idempotency_key: `storia-expired-${input.propertyId}-${input.republished ? "auto" : "manual"}-${profile.id}`,
        },
        { apiKey },
      );
    }
  } catch (error) {
    console.error("[storia] emailul de expirare nu a putut fi trimis", error);
  }
}
