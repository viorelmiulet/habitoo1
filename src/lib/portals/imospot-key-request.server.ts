/** Legătura cu baza de date și cu Mailgun pentru cererea de cheie Imospot. */
import {
  IMOSPOT_PORTAL_ID,
  KEY_REQUEST_PORTALS,
  notifyKeyRequestForRequest,
  resolveKeyRequestSettings,
  type KeyRequestPortalId,
  type ImospotCompanyData,
  type NotifyDeps,
  type NotifyOutcome,
  type NotifyRequestRow,
} from "./imospot-key-request";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function loadKeyRequestSettings(portal: KeyRequestPortalId) {
  const db = await admin();
  const { data } = await db
    .from("platform_settings")
    .select("value")
    .eq("key", KEY_REQUEST_PORTALS[portal].settingsKey)
    .maybeSingle();
  return resolveKeyRequestSettings(portal, data?.value);
}

export function loadImospotSettings() {
  return loadKeyRequestSettings(IMOSPOT_PORTAL_ID);
}

/** Administratorul agenției: cel care a cerut activarea, altfel primul admin al agenției. */
async function resolveAdminId(organizationId: string, requestedBy: string | null) {
  if (requestedBy) return requestedBy;
  const db = await admin();
  const { data } = await db
    .from("user_roles")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("role", "agency_admin")
    .limit(1);
  return data?.[0]?.user_id ?? null;
}

export async function loadImospotCompanyData(
  organizationId: string,
  requestedBy: string | null,
): Promise<ImospotCompanyData> {
  const db = await admin();
  const adminId = await resolveAdminId(organizationId, requestedBy);
  const [{ data: org }, profileRes, userRes] = await Promise.all([
    db
      .from("organizations")
      .select("name, legal_name, cui, trade_registry_number, city")
      .eq("id", organizationId)
      .maybeSingle(),
    adminId
      ? db.from("profiles").select("full_name, phone").eq("id", adminId).maybeSingle()
      : Promise.resolve({ data: null }),
    adminId ? db.auth.admin.getUserById(adminId) : Promise.resolve({ data: { user: null } }),
  ]);
  const profile = (profileRes as { data: { full_name: string | null; phone: string | null } | null }).data;
  const user = (userRes as { data: { user: { email?: string | null } | null } }).data.user;
  return {
    agencyName: org?.name ?? null,
    legalName: org?.legal_name ?? null,
    cui: org?.cui ?? null,
    tradeRegistryNumber: org?.trade_registry_number ?? null,
    adminName: profile?.full_name ?? null,
    adminEmail: user?.email ?? null,
    adminPhone: profile?.phone ?? null,
    city: org?.city ?? null,
  };
}

function liveDeps(actorId: string | null): NotifyDeps {
  const requestedBy = new Map<string, string | null>();
  return {
    loadRequest: async (id) => {
      const db = await admin();
      const { data } = await db
        .from("portal_activation_requests")
        .select("id, organization_id, portal, status, provider_notify_required, provider_notified_at, requested_by")
        .eq("id", id)
        .maybeSingle();
      if (!data) return null;
      requestedBy.set(data.id, data.requested_by ?? null);
      return {
        id: data.id,
        organizationId: data.organization_id,
        portal: data.portal,
        status: data.status,
        notifyRequired: data.provider_notify_required === true,
        notifiedAt: data.provider_notified_at,
      };
    },
    loadCompany: (row: NotifyRequestRow) =>
      loadImospotCompanyData(row.organizationId, requestedBy.get(row.id) ?? null),
    loadSettings: loadKeyRequestSettings,
    send: async (email) => {
      const { sendEmail } = await import("@/lib/mailgun.server");
      const r = await sendEmail({
        from: email.from,
        to: email.to,
        cc: email.cc,
        replyTo: email.replyTo,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    },
    save: async (id, patch) => {
      const db = await admin();
      await db
        .from("portal_activation_requests")
        .update({
          provider_notify_error: patch.error,
          provider_notify_required: true,
          ...(patch.notifiedAt ? { provider_notified_at: patch.notifiedAt } : {}),
        })
        .eq("id", id);
    },
    audit: async (row, values) => {
      const db = await admin();
      await db.from("audit_logs").insert({
        organization_id: row.organizationId,
        actor_id: actorId,
        action: "portal.provider_key_requested",
        entity: "portal_activation_requests",
        entity_id: row.id,
        new_values: { portal: row.portal, ...values },
      } as never);
    },
  };
}

export async function notifyKeyRequest(
  requestId: string,
  actorId: string | null,
  opts: { force?: boolean } = {},
): Promise<NotifyOutcome> {
  return notifyKeyRequestForRequest(liveDeps(actorId), requestId, opts);
}

export const notifyImospotRequest = notifyKeyRequest;

/**
 * Reîncercare automată: aprobă automat cererile Imospot rămase `pending` (flux vechi)
 * și trimite cererile aprobate, netrimise încă. Protecția „deja trimis" rămâne în
 * `notifyImospotForRequest` (`provider_notified_at`).
 */
export async function retryPendingKeyRequests(
  organizationId: string,
  actorId: string | null,
  portal: KeyRequestPortalId,
) {
  try {
    const db = await admin();
    const { data: pending } = await db
      .from("portal_activation_requests")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("portal", portal)
      .eq("status", "pending");
    for (const p of pending ?? []) {
      const { data: updated } = await db
        .from("portal_activation_requests")
        .update({
          status: "approved",
          resolved_at: new Date().toISOString(),
          resolved_by: null,
          provider_notify_required: true,
        } as never)
        .eq("id", p.id)
        .eq("status", "pending")
        .select("id");
      if ((updated ?? []).length > 0) {
        await db.from("audit_logs").insert({
          organization_id: organizationId,
          actor_id: actorId,
          action: "portal.activation_request_auto_approved",
          entity: "portal_activation_requests",
          entity_id: p.id,
          old_values: { status: "pending" },
          new_values: { status: "approved", portal },
        } as never);
      }
    }
    const { data } = await db
      .from("portal_activation_requests")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("portal", portal)
      .eq("status", "approved")
      .is("provider_notified_at", null);
    for (const r of data ?? []) await notifyKeyRequest(r.id, actorId);
  } catch (e) {
    console.error(`[${portal}] pending notify failed`, (e as Error).message);
  }
}

export function retryPendingImospotRequests(organizationId: string, actorId: string | null) {
  return retryPendingKeyRequests(organizationId, actorId, IMOSPOT_PORTAL_ID);
}
