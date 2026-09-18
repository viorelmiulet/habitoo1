/**
 * Import în CRM (Stage 13) — idempotent, atomic și strict după aprobare umană.
 *
 * Reguli:
 *  - importul rulează NUMAI pentru un prospect cu status `approved`;
 *  - dacă prospectul a fost deja importat, se întoarce rezultatul existent
 *    (fără duplicate);
 *  - dacă există deja un contact cu același telefon, NU se creează alt contact:
 *    se propune asocierea, iar decizia rămâne la om;
 *  - contactul, leadul și actualizarea prospectului se scriu într-o singură
 *    tranzacție Postgres (`prospect_import_to_crm`): dacă orice pas eșuează,
 *    nu rămâne nimic în urmă — niciun contact orfan, niciun lead fără prospect
 *    marcat ca importat.
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

const MESSAGES = {
  not_found: "Oportunitatea nu există în agenția ta.",
  not_approved: "Importul este permis doar după aprobarea oportunității.",
  needs_link:
    "Există deja un contact cu acest număr de telefon. Confirmă asocierea în loc să creezi un contact nou.",
  failed: "Importul nu a putut fi finalizat.",
  imported: "Oportunitatea a fost importată în CRM.",
  already_imported: "Oportunitatea era deja importată în CRM.",
} as const;

type RpcPayload = {
  ok: boolean;
  code?: string | null;
  status?: string | null;
  contactId?: string | null;
  leadId?: string | null;
  existingContact?: { id: string; name: string; phone: string | null } | null;
};

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
    .select("id,seller_phone")
    .eq("id", prospectId)
    .eq("organization_id", actor.organizationId)
    .maybeSingle();
  if (!prospect) {
    return { ok: false, code: "not_found", message: MESSAGES.not_found };
  }

  const phone = normalizePhone(prospect.seller_phone);
  const { data, error } = await admin.rpc("prospect_import_to_crm", {
    _org: actor.organizationId,
    _actor: actor.userId,
    _prospect: prospectId,
    _phone: phone ?? undefined,
    _link_contact: options.linkContactId ?? undefined,

  });
  if (error) {
    console.error("[prospecting] import rpc failed", error.message);
    return { ok: false, code: "failed", message: MESSAGES.failed };
  }

  const payload = (data ?? null) as RpcPayload | null;
  if (!payload) return { ok: false, code: "failed", message: MESSAGES.failed };

  if (!payload.ok) {
    const code =
      payload.code === "not_found" || payload.code === "not_approved" || payload.code === "needs_link"
        ? payload.code
        : "failed";
    return {
      ok: false,
      code,
      message: MESSAGES[code],
      ...(payload.existingContact ? { existingContact: payload.existingContact } : {}),
    };
  }

  const status = payload.status === "already_imported" ? "already_imported" : "imported";
  if (!payload.leadId) return { ok: false, code: "failed", message: MESSAGES.failed };
  return {
    ok: true,
    status,
    contactId: payload.contactId ?? null,
    leadId: payload.leadId,
    message: MESSAGES[status],
  };
}
