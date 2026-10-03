/**
 * Cereri de activare portal.
 *
 * Fluxul are două capete strict separate:
 *  - administratorul agenției vede DOAR catalogul de portaluri + statusul
 *    agenției lui și poate trimite o cerere de activare (fără nicio
 *    configurare, fără credențiale);
 *  - Superadminul vede cererile, le aprobă (activând portalul din ecranul
 *    existent) sau le respinge cu motiv opțional.
 *
 * Totul este verificat server-side și jurnalizat în `audit_logs`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import {
  configurablePortals,
  derivePortalConnectionStatus,
  getPortalDefinition,
  portalActivationMode,
  type PortalActivationMode,
  type PortalConnectionStatus,
  isPortalCovered,
  portalDisplayName,
} from "@/lib/portals/registry";

type AuthContext = {
  supabase: {
    rpc: (fn: string) => PromiseLike<{ data: unknown; error: unknown }>;
    from: (table: string) => {
      select: (cols: string) => {
        eq: (
          col: string,
          value: string,
        ) => {
          maybeSingle: () => PromiseLike<{ data: { organization_id: string | null } | null }>;
        };
      };
    };
  };
  userId: string;
};

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function requireSuperadmin(context: AuthContext): Promise<void> {
  const { data } = await context.supabase.rpc("is_superadmin");
  if (data !== true) {
    throw new Error("Acces refuzat: doar Superadmin poate rezolva cererile de activare.");
  }
}

/** Agenția vine din sesiune, niciodată din input, și doar pentru agency_admin. */
async function requireOrgAdminOrg(context: AuthContext): Promise<string> {
  const { data: isOrgAdmin } = await context.supabase.rpc("is_org_admin");
  if (isOrgAdmin !== true) {
    throw new Error(
      "Acces refuzat: doar administratorul agenției poate cere activarea unui portal.",
    );
  }
  const { data: profile } = await context.supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", context.userId)
    .maybeSingle();
  if (!profile?.organization_id) throw new Error("Contul nu este asociat unei agenții.");
  return profile.organization_id;
}

export type AgencyPortalCatalogItem = {
  id: string;
  displayName: string;
  description: string;
  availability: string;
  activated: boolean;
  activation: PortalActivationMode;
  connectionStatus: PortalConnectionStatus;
  request: {
    id: string;
    status: "pending" | "approved" | "rejected";
    requestedAt: string;
    rejectionReason: string | null;
  } | null;
};

/** Catalogul platformei, cu statusul agenției din sesiune. READ-ONLY. */
export const getAgencyPortalCatalog = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .handler(async ({ context }): Promise<AgencyPortalCatalogItem[]> => {
    const organizationId = await requireOrgAdminOrg(context as unknown as AuthContext);
    const admin = await loadAdmin();

    const [{ data: connections }, { data: requests }] = await Promise.all([
      admin
        .from("portal_connections")
        .select("portal, activated, external_account_id, portal_credentials_encrypted, last_sync_error, last_sync_status")
        .eq("organization_id", organizationId),
      admin
        .from("portal_activation_requests")
        .select("id, portal, status, requested_at, rejection_reason")
        .eq("organization_id", organizationId)
        .order("requested_at", { ascending: false }),
    ]);

    const activated = new Set(
      (connections ?? []).filter((c) => c.activated === true).map((c) => c.portal),
    );
    type RequestRow = {
      id: string;
      portal: string;
      status: string;
      requested_at: string;
      rejection_reason: string | null;
    };
    const latest = new Map<string, RequestRow>();
    for (const row of requests ?? []) {
      if (!latest.has(row.portal)) latest.set(row.portal, row);
    }

    const rows = new Map((connections ?? []).map((c) => [c.portal, c]));
    return configurablePortals().map((p) => {
      const req = latest.get(p.id);
      const row = rows.get(p.id);
      return {
        activation: portalActivationMode(p.id),
        connectionStatus: derivePortalConnectionStatus({
          definition: p,
          activated: row?.activated === true,
          externalAccountId: row?.external_account_id ?? null,
          hasPortalCredential: Boolean(row?.portal_credentials_encrypted),
          hasOAuthTokens: Boolean(row?.portal_credentials_encrypted),
          lastError: row?.last_sync_error ?? null,
          lastSyncStatus: row?.last_sync_status ?? null,
        }),
        id: p.id,
        displayName: portalDisplayName(p.id),
        description: p.description,
        availability: p.status,
        activated: activated.has(p.id),
        request: req
          ? {
              id: req.id,
              status: req.status as "pending" | "approved" | "rejected",
              requestedAt: req.requested_at,
              rejectionReason: req.rejection_reason ?? null,
            }
          : null,
      };
    });
  });

/** Trimite o cerere de activare. Nu activează nimic: doar notifică Superadminul. */
export const requestPortalActivation = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ portalId: z.string().min(1).max(40), note: z.string().max(500).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const organizationId = await requireOrgAdminOrg(context as unknown as AuthContext);
    const definition = getPortalDefinition(data.portalId);
    if (!definition) throw new Error("Portal necunoscut.");
    // Portalurile acoperite de o altă integrare nu se activează separat.
    if (isPortalCovered(data.portalId)) throw new Error("Portal necunoscut.");
    // Portalurile self-service se activează direct, fără cerere.
    if (portalActivationMode(definition.id) === "self_service") {
      throw new Error("Acest portal se activează direct, fără cerere.");
    }

    const admin = await loadAdmin();

    const { data: connection } = await admin
      .from("portal_connections")
      .select("activated")
      .eq("organization_id", organizationId)
      .eq("portal", definition.id)
      .maybeSingle();
    if (connection?.activated === true) {
      throw new Error("Portalul este deja activat pentru agenția ta.");
    }

    const { data: existing } = await admin
      .from("portal_activation_requests")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("portal", definition.id)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) {
      return { ok: true as const, alreadyPending: true as const };
    }

    const { data: inserted, error } = await admin
      .from("portal_activation_requests")
      .insert({
        organization_id: organizationId,
        portal: definition.id,
        status: "pending",
        requested_by: context.userId,
        note: data.note ?? null,
      } as never)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);

    const [{ data: org }, { data: profile }] = await Promise.all([
      admin.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
      admin.from("profiles").select("full_name").eq("id", context.userId).maybeSingle(),
    ]);

    // Notificare pentru toți superadminii, în clopoțelul existent.
    const { data: supers } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "superadmin");
    const uniqueSupers = Array.from(new Set((supers ?? []).map((r) => r.user_id)));
    if (uniqueSupers.length > 0) {
      await admin.from("notifications").insert(
        uniqueSupers.map((userId) => ({
          organization_id: null,
          user_id: userId,
          type: "portal_activation_request",
          title: `Cerere activare ${definition.display_name}`,
          body: `${org?.name ?? "O agenție"} a cerut activarea portalului ${definition.display_name} (${profile?.full_name ?? "administrator agenție"}).`,
          link: "/superadmin/portals",
          created_by: context.userId,
        })) as never,
      );
    }

    await admin.from("audit_logs").insert({
      organization_id: organizationId,
      actor_id: context.userId,
      action: "portal.activation_requested",
      entity: "portal_activation_requests",
      entity_id: inserted?.id ?? null,
      new_values: { portal: definition.id, status: "pending", note: data.note ?? null },
      created_by: context.userId,
    } as never);

    return { ok: true as const, alreadyPending: false as const };
  });

export type PortalActivationRequestRow = {
  id: string;
  organizationId: string;
  organizationName: string;
  portalId: string;
  portalName: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  requestedByName: string | null;
  resolvedAt: string | null;
  rejectionReason: string | null;
  note: string | null;
};

/** Lista cererilor pentru Superadmin. */
export const listPortalActivationRequests = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ status: z.enum(["pending", "approved", "rejected", "all"]).default("pending") })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<PortalActivationRequestRow[]> => {
    await requireSuperadmin(context as unknown as AuthContext);
    const admin = await loadAdmin();

    let query = admin
      .from("portal_activation_requests")
      .select(
        "id, organization_id, portal, status, requested_at, requested_by, resolved_at, rejection_reason, note",
      )
      .order("requested_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") query = query.eq("status", data.status);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const list = rows ?? [];
    if (list.length === 0) return [];

    const orgIds = Array.from(new Set(list.map((r) => r.organization_id)));
    const userIds = Array.from(
      new Set(list.map((r) => r.requested_by).filter((v): v is string => !!v)),
    );
    const [{ data: orgs }, { data: profiles }] = await Promise.all([
      admin.from("organizations").select("id, name").in("id", orgIds),
      userIds.length > 0
        ? admin.from("profiles").select("id, full_name").in("id", userIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    ]);
    const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]));
    const userName = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

    return list.map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      organizationName: orgName.get(r.organization_id) ?? "Agenție",
      portalId: r.portal,
      portalName: portalDisplayName(r.portal),
      status: r.status as "pending" | "approved" | "rejected",
      requestedAt: r.requested_at,
      requestedByName: r.requested_by ? (userName.get(r.requested_by) ?? null) : null,
      resolvedAt: r.resolved_at,
      rejectionReason: r.rejection_reason,
      note: r.note,
    }));
  });

/** Marchează o cerere ca aprobată sau respinsă (Superadmin). */
export const resolvePortalActivationRequest = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        status: z.enum(["approved", "rejected"]),
        reason: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireSuperadmin(context as unknown as AuthContext);
    const admin = await loadAdmin();

    const { data: request } = await admin
      .from("portal_activation_requests")
      .select("id, organization_id, portal, status")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!request) throw new Error("Cererea nu a fost găsită.");
    if (request.status !== "pending") throw new Error("Cererea a fost deja rezolvată.");

    const { error } = await admin
      .from("portal_activation_requests")
      .update({
        status: data.status,
        resolved_by: context.userId,
        resolved_at: new Date().toISOString(),
        rejection_reason: data.status === "rejected" ? (data.reason ?? null) : null,
      } as never)
      .eq("id", request.id);
    if (error) throw new Error(error.message);

    await admin.from("audit_logs").insert({
      organization_id: request.organization_id,
      actor_id: context.userId,
      action:
        data.status === "approved"
          ? "portal.activation_request_approved"
          : "portal.activation_request_rejected",
      entity: "portal_activation_requests",
      entity_id: request.id,
      old_values: { status: "pending" },
      new_values: { status: data.status, reason: data.reason ?? null, portal: request.portal },
      created_by: context.userId,
    } as never);

    return { ok: true as const };
  });

export class PortalAccessError extends Error {
  readonly status = 403;
}

/**
 * Activare self-service din grila agenției: doar adminul agenției, pentru agenția lui,
 * doar portalurile `self_service`/`oauth` din registru. Refolosește activarea din Superadmin
 * (`applyPortalActivationForOrg`) și, la La Cheie, înregistrarea agenției.
 */
export async function selfActivatePortalForSession(
  context: AuthContext,
  input: { portalId: string; organizationId?: string },
): Promise<{ ok: boolean; alreadyActive: boolean; error: string | null }> {
  let organizationId: string;
  try {
    organizationId = await requireOrgAdminOrg(context);
  } catch {
    throw new PortalAccessError("Acces refuzat: doar administratorul agenției poate activa portaluri.");
  }
  if (input.organizationId && input.organizationId !== organizationId) {
    throw new PortalAccessError("Acces refuzat: poți activa portaluri doar pentru agenția ta.");
  }
  const definition = getPortalDefinition(input.portalId);
  if (!definition || isPortalCovered(input.portalId)) throw new Error("Portal necunoscut.");
  const mode = portalActivationMode(definition.id);
  if (mode !== "self_service" && mode !== "oauth") {
    throw new PortalAccessError("Acest portal se activează doar cu aprobarea echipei Habitoo.");
  }

  const admin = await loadAdmin();
  const { data: row } = await admin
    .from("portal_connections")
    .select("id, activated, last_sync_error")
    .eq("organization_id", organizationId)
    .eq("portal", definition.id)
    .maybeSingle();
  if (row?.activated === true && !row.last_sync_error) {
    return { ok: true, alreadyActive: true, error: null };
  }

  if (definition.id === "lacheie") {
    const { runLaCheieAgencyActivation } = await import("@/lib/portals/lacheie.functions");
    try {
      await runLaCheieAgencyActivation(context as never, organizationId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Activarea La Cheie a eșuat.";
      // Pasul extern a eșuat: portalul apare „Eroare”, fără trimiteri reale.
      await admin
        .from("portal_connections")
        .update({
          activated: true,
          last_sync_status: "error",
          last_sync_error: message.slice(0, 500),
          updated_by: context.userId,
        } as never)
        .eq("organization_id", organizationId)
        .eq("portal", definition.id);
      await writeSelfActivationAudit(organizationId, context.userId, definition.id, false);
      return { ok: false, alreadyActive: false, error: message };
    }
  }

  const { applyPortalActivationForOrg } = await import("@/lib/portals.functions");
  await applyPortalActivationForOrg({
    organizationId,
    portalId: definition.id,
    activated: true,
    actorId: context.userId,
    source: "self_service",
  });
  await writeSelfActivationAudit(organizationId, context.userId, definition.id, true);
  return { ok: true, alreadyActive: false, error: null };
}

async function writeSelfActivationAudit(
  organizationId: string,
  actorId: string,
  portal: string,
  success: boolean,
) {
  const admin = await loadAdmin();
  await admin.from("audit_logs").insert({
    organization_id: organizationId,
    actor_id: actorId,
    action: "portal.self_activated",
    entity: "portal_connections",
    new_values: { portal, success, source: "self_service", at: new Date().toISOString() },
    created_by: actorId,
  } as never);
}

export const selfActivatePortal = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ portalId: z.string().min(1).max(40), organizationId: z.string().uuid().optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      return await selfActivatePortalForSession(context as unknown as AuthContext, data);
    } catch (error) {
      if (error instanceof PortalAccessError) {
        const { setResponseStatus } = await import("@tanstack/react-start/server");
        setResponseStatus(403);
      }
      throw error;
    }
  });
