/**
 * Import în CRM (Stage 13) — idempotent și strict după aprobare umană.
 *
 * Reguli:
 *  - importul rulează NUMAI pentru un prospect cu status `approved`;
 *  - dacă prospectul a fost deja importat, se întoarce rezultatul existent
 *    (fără duplicate);
 *  - dacă există deja un contact cu același telefon, NU se creează alt contact:
 *    se propune asocierea, iar decizia rămâne la om.
 */
import type { AiActor } from "@/lib/ai/gateway/types";
import { normalizePhone } from "./normalize";

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type ProspectImportResult =
  | {
      ok: true;
      status: "imported" | "already_imported";
      contactId: string | null;
      leadId: string;
      message: string;
    }
  | {
      ok: false;
      code: "not_found" | "not_approved" | "needs_link" | "failed";
      message: string;
      /** Contactul existent cu același telefon, pentru propunerea de asociere. */
      existingContact?: { id: string; name: string; phone: string | null };
    };

const PROSPECT_COLUMNS =
  "id,organization_id,title,description,seller_name,seller_phone,seller_type,city,county,zone,price,currency,rooms,surface_useful,property_type,transaction_type,source_url,status,imported_contact_id,imported_lead_id,opportunity_score";

function contactName(prospect: { seller_name: string | null; title: string }): {
  first: string;
  last: string;
} {
  const raw = (prospect.seller_name ?? "").trim();
  if (raw === "") return { first: "Proprietar", last: "prospect" };
  const parts = raw.split(/\s+/);
  return { first: parts[0] ?? raw, last: parts.slice(1).join(" ") || "-" };
}

/**
 * Importă un prospect aprobat: creează (sau asociază) contactul și un lead.
 * `linkContactId` este folosit doar când utilizatorul a acceptat asocierea.
 */
export async function importProspectToCrm(
  actor: AiActor,
  prospectId: string,
  options: { linkContactId?: string | null } = {},
): Promise<ProspectImportResult> {
  const admin = await loadAdmin();
  const { data: prospect } = await admin
    .from("prospects")
    .select(PROSPECT_COLUMNS)
    .eq("id", prospectId)
    .eq("organization_id", actor.organizationId)
    .maybeSingle();
  if (!prospect) {
    return { ok: false, code: "not_found", message: "Oportunitatea nu există în agenția ta." };
  }

  // Idempotență: un prospect deja importat nu creează a doua înregistrare.
  if (prospect.status === "imported" && prospect.imported_lead_id) {
    return {
      ok: true,
      status: "already_imported",
      contactId: prospect.imported_contact_id,
      leadId: prospect.imported_lead_id,
      message: "Oportunitatea era deja importată în CRM.",
    };
  }
  if (prospect.status !== "approved") {
    return {
      ok: false,
      code: "not_approved",
      message: "Importul este permis doar după aprobarea oportunității.",
    };
  }

  const phone = normalizePhone(prospect.seller_phone);
  let contactId = options.linkContactId ?? null;

  if (contactId) {
    const { data: linked } = await admin
      .from("contacts")
      .select("id")
      .eq("id", contactId)
      .eq("organization_id", actor.organizationId)
      .maybeSingle();
    if (!linked) {
      return { ok: false, code: "not_found", message: "Contactul propus nu există în agenția ta." };
    }
  } else if (phone) {
    const { data: existing } = await admin
      .from("contacts")
      .select("id,first_name,last_name,phone")
      .eq("organization_id", actor.organizationId)
      .eq("phone", phone)
      .maybeSingle();
    if (existing) {
      return {
        ok: false,
        code: "needs_link",
        message:
          "Există deja un contact cu acest număr de telefon. Confirmă asocierea în loc să creezi un contact nou.",
        existingContact: {
          id: existing.id,
          name: `${existing.first_name} ${existing.last_name}`.trim(),
          phone: existing.phone,
        },
      };
    }
  }

  if (!contactId) {
    const name = contactName(prospect);
    const { data: created, error } = await admin
      .from("contacts")
      .insert({
        organization_id: actor.organizationId,
        created_by: actor.userId,
        assigned_to: actor.userId,
        first_name: name.first,
        last_name: name.last,
        phone: phone,
        type: "owner",
        source: "prospecting",
        notes: prospect.source_url ? `Sursă prospect: ${prospect.source_url}` : null,
      })
      .select("id")
      .single();
    if (error || !created) {
      console.error("[prospecting] contact insert failed", error?.message);
      return { ok: false, code: "failed", message: "Contactul nu a putut fi creat." };
    }
    contactId = created.id;
  }

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .insert({
      organization_id: actor.organizationId,
      created_by: actor.userId,
      assigned_to: actor.userId,
      contact_id: contactId,
      name: prospect.title.slice(0, 160),
      phone,
      stage: "new",
      source: "prospecting",
      score: prospect.opportunity_score ?? 0,
      value: prospect.price,
      notes: [
        prospect.source_url ? `Anunț: ${prospect.source_url}` : null,
        prospect.city ? `Localitate: ${prospect.city}` : null,
        prospect.seller_type ? `Tip vânzător: ${prospect.seller_type}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    })
    .select("id")
    .single();
  if (leadError || !lead) {
    console.error("[prospecting] lead insert failed", leadError?.message);
    return { ok: false, code: "failed", message: "Leadul nu a putut fi creat." };
  }

  await admin
    .from("prospects")
    .update({
      status: "imported",
      imported_contact_id: contactId,
      imported_lead_id: lead.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", prospectId)
    .eq("organization_id", actor.organizationId);

  await admin.from("prospect_reviews").insert({
    organization_id: actor.organizationId,
    prospect_id: prospectId,
    reviewer_id: actor.userId,
    decision: options.linkContactId ? "linked" : "imported",
    notes: options.linkContactId ? "Asociat unui contact existent." : "Import nou în CRM.",
  });

  return {
    ok: true,
    status: "imported",
    contactId,
    leadId: lead.id,
    message: "Oportunitatea a fost importată în CRM.",
  };
}
