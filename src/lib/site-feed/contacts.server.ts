/**
 * POST /api/public/sites/v1/contacts — logica (testabilă, cu client injectat).
 * Token de site: comportamentul istoric (sursă website). Token de portal
 * (`auth.portal`): lead de portal prin `ingestPortalLead`, responsabil =
 * agentul proprietății, retrimiteri deduplicate pe `message_id`.
 */
import { z } from "zod";
import { getPortalDefinition } from "@/lib/portals/registry";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

export const contactSchema = z.object({
  nume: z.string().trim().min(2).max(120),
  telefon: z.string().trim().min(6).max(32).optional(),
  email: z.string().trim().email().max(255).optional(),
  mesaj: z.string().trim().max(2000).optional(),
  id: z.string().uuid().optional(),
  idstr: z.string().trim().min(1).max(120).optional(),
  source: z.string().trim().max(60).optional(),
  message_id: z.string().trim().min(1).max(120).optional(),
});
export type ContactInput = z.infer<typeof contactSchema>;

export type ContactAuth = { organizationId: string; portal: string | null };
export type ContactResult =
  | { status: 200 | 201; data: { lead_id: string; contact_id: string | null; deduplicated: boolean } }
  | { status: 404 | 422; message: string };

/** Numele portalului din registry („Imobiliare+”); altfel id-ul. */
export function portalSourceLabel(portal: string): string {
  return getPortalDefinition(portal)?.display_name ?? portal;
}

const MESSAGE_TTL_DAYS = 90;

export async function handleSiteContact(admin: Admin, auth: ContactAuth, input: ContactInput, now = new Date()): Promise<ContactResult> {
  if (!input.telefon && !input.email) return { status: 422, message: "Either telefon or email is required." };
  const nowIso = now.toISOString();

  // Proprietatea: `id` sau `idstr` (referința din feed), doar în agenția din token.
  type Prop = { id: string; assigned_to: string | null; title: string | null };
  let property: Prop | null = null;
  if (input.id || input.idstr) {
    const q = admin.from("properties").select("id, assigned_to, title").eq("organization_id", auth.organizationId);
    const { data } = await (input.id ? q.eq("id", input.id) : q.eq("reference", input.idstr!)).maybeSingle();
    if (!data) return { status: 404, message: "Property not found." };
    property = data as Prop;
  }
  const propertyId = property?.id ?? null;

  const label = auth.portal ? portalSourceLabel(auth.portal) : null;

  // Retrimitere de la portal: același portal + același `message_id` → lead-ul existent.
  if (auth.portal && input.message_id) {
    const { data: link } = await admin.from("portal_lead_links").select("lead_id")
      .eq("portal", auth.portal).eq("organization_id", auth.organizationId).eq("external_lead_id", input.message_id).maybeSingle();
    if (link?.lead_id) {
      const { data: lead } = await admin.from("leads").select("contact_id").eq("id", link.lead_id as string).maybeSingle();
      return { status: 200, data: { lead_id: link.lead_id as string, contact_id: (lead?.contact_id as string | null) ?? null, deduplicated: true } };
    }
  }

  const [firstName, ...restName] = input.nume.split(/\s+/);
  const lastName = restName.join(" ");

  // Deduplicare contact: telefon sau email, în cadrul agenției.
  let contactId: string;
  const dedupe = admin.from("contacts").select("id").eq("organization_id", auth.organizationId).limit(1);
  const existing = input.email ? await dedupe.eq("email", input.email) : await dedupe.eq("phone", input.telefon!);
  if (existing.data?.[0]) {
    contactId = existing.data[0].id as string;
  } else {
    const { data: created, error } = await admin.from("contacts").insert({
      organization_id: auth.organizationId,
      type: "buyer",
      first_name: firstName ?? input.nume,
      last_name: lastName || "-",
      phone: input.telefon ?? null,
      email: input.email ?? null,
      source: label ?? "Site-ul agenției",
      notes: input.mesaj ?? null,
      status: "new",
    }).select("id").single();
    if (error) throw error;
    contactId = created.id as string;
  }

  if (auth.portal && label) {
    const { ingestPortalLead } = await import("@/lib/portals/lead-ingest.server");
    const event = `Cerere primită de pe ${label}`;
    const r = await ingestPortalLead(admin, {
      portal: auth.portal,
      source: label,
      match: { organizationId: auth.organizationId, propertyId, assignedTo: property?.assigned_to ?? null, propertyTitle: property?.title ?? null },
      name: input.nume,
      email: input.email ?? null,
      phone: input.telefon ?? null,
      senderName: input.nume,
      bodyText: input.mesaj ?? null,
      noteLine: [`[${label} · ${nowIso.slice(0, 16).replace("T", " ")}]`, input.mesaj].filter(Boolean).join("\n"),
      sentAt: nowIso,
      now: nowIso,
      messageRowId: null,
      expiresAt: new Date(now.getTime() + MESSAGE_TTL_DAYS * 86_400_000).toISOString(),
      createdEventNote: event,
      notificationTitle: `Cerere nouă din ${label}`,
      notificationBody: property?.title ? `Pentru „${property.title}”` : "Cerere fără anunț asociat",
      auditAction: "site_feed.contact_received",
      auditValues: { source: label, portal: auth.portal, property_id: propertyId, message_id: input.message_id ?? null },
    });
    if (r.created) await admin.from("leads").update({ contact_id: contactId }).eq("id", r.leadId);
    if (input.message_id) {
      await admin.from("portal_lead_links").upsert({
        organization_id: auth.organizationId, portal: auth.portal, external_lead_id: input.message_id, lead_id: r.leadId, updated_at: nowIso,
      }, { onConflict: "portal,organization_id,external_lead_id" });
    }
    return { status: r.created ? 201 : 200, data: { lead_id: r.leadId, contact_id: contactId, deduplicated: !r.created } };
  }

  // Token de site: comportamentul istoric.
  const source = input.source ? `website:${input.source}` : "website";
  const openLeadQuery = admin.from("leads").select("id, notes")
    .eq("organization_id", auth.organizationId).eq("contact_id", contactId).not("stage", "in", "(won,lost)").limit(1);
  const openLead = await (propertyId ? openLeadQuery.eq("property_id", propertyId) : openLeadQuery.is("property_id", null)).maybeSingle();

  let leadId: string;
  let deduplicated = false;
  if (openLead.data) {
    leadId = openLead.data.id as string;
    deduplicated = true;
    const notes = input.mesaj
      ? [openLead.data.notes, input.mesaj].filter(Boolean).join("\n---\n").slice(0, 8000)
      : openLead.data.notes;
    await admin.from("leads").update({ last_interaction_at: nowIso, notes }).eq("organization_id", auth.organizationId).eq("id", leadId);
  } else {
    const { data: lead, error } = await admin.from("leads").insert({
      organization_id: auth.organizationId,
      contact_id: contactId,
      property_id: propertyId,
      name: input.nume,
      phone: input.telefon ?? null,
      email: input.email ?? null,
      source,
      stage: "new",
      notes: input.mesaj ?? null,
      last_interaction_at: nowIso,
    }).select("id").single();
    if (error) throw error;
    leadId = lead.id as string;
    await admin.from("lead_events").insert({
      organization_id: auth.organizationId, lead_id: leadId, to_stage: "new", note: `Lead primit din site (${source}).`,
    });
  }

  await admin.from("audit_logs").insert({
    organization_id: auth.organizationId,
    action: "site_feed.contact_received",
    entity: "leads",
    entity_id: leadId,
    new_values: { source, property_id: propertyId, deduplicated },
  });
  return { status: 201, data: { lead_id: leadId, contact_id: contactId, deduplicated } };
}
