/**
 * Arhivarea unei proprietăți: iese din listă, dar nimic nu se pierde.
 *
 * Regula de siguranță: o proprietate publicată pe portaluri sau oferită în
 * Colaborare NU poate fi arhivată cât timp e activă acolo. Altfel ar dispărea
 * din CRM, dar ar rămâne vizibilă public, fără ca agentul să mai aibă unde s-o
 * gestioneze. Retragerea nu este automatizată aici: utilizatorul o confirmă
 * separat, prin fluxul de retragere existent.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { getPortalDefinition } from "@/lib/portals/registry";

/** Stările în care anunțul este (sau poate deveni) vizibil pe portal. */
const LIVE_LISTING_STATUSES = ["published", "updated", "pending"];

type AuthContext = { userId: string };

export type ArchiveBlocker = {
  kind: "portal" | "collaboration";
  id: string;
  name: string;
  status: string;
  publicUrl: string | null;
};

export type PropertyArchiveState = {
  propertyId: string;
  reference: string | null;
  title: string;
  status: string;
  archived: boolean;
  canArchive: boolean;
  blockers: ArchiveBlocker[];
};

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Actor = { userId: string; organizationId: string | null; isAdmin: boolean; isSuperadmin: boolean };

async function loadActor(context: AuthContext): Promise<Actor> {
  const admin = await loadAdmin();
  const [{ data: profile }, { data: roles }] = await Promise.all([
    admin.from("profiles").select("organization_id").eq("id", context.userId).maybeSingle(),
    admin.from("user_roles").select("role").eq("user_id", context.userId),
  ]);
  const list = (roles ?? []).map((r) => String(r.role));
  const isSuperadmin = list.includes("superadmin");
  return {
    userId: context.userId,
    organizationId: profile?.organization_id ?? null,
    isAdmin: isSuperadmin || list.includes("agency_admin"),
    isSuperadmin,
  };
}

/**
 * Drepturile se verifică server-side: administratorul agenției poate arhiva
 * orice proprietate a agenției, agentul doar pe cele asignate lui.
 */
async function loadProperty(actor: Actor, propertyId: string) {
  const admin = await loadAdmin();
  const { data: property, error } = await admin
    .from("properties")
    .select("id, organization_id, reference, title, status, assigned_to, collaboration, pre_archive_status")
    .eq("id", propertyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!property) throw new Error("Proprietatea nu există.");
  if (!actor.isSuperadmin) {
    if (!actor.organizationId || property.organization_id !== actor.organizationId) {
      throw new Error("Proprietatea nu aparține agenției tale.");
    }
    if (!actor.isAdmin && property.assigned_to !== actor.userId) {
      throw new Error("Poți arhiva doar proprietățile care îți sunt asignate.");
    }
  }
  return property;
}

async function collectBlockers(
  organizationId: string,
  propertyId: string,
  collaboration: boolean | null,
): Promise<ArchiveBlocker[]> {
  const admin = await loadAdmin();
  const [{ data: listings }, { data: publications }] = await Promise.all([
    admin
      .from("portal_listings")
      .select("portal, status, public_url")
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId),
    admin
      .from("portal_publications")
      .select("portal_key, enabled")
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId),
  ]);

  const blockers = new Map<string, ArchiveBlocker>();
  for (const row of listings ?? []) {
    // Un anunț retras cu succes (`withdrawn`) nu mai blochează arhivarea.
    if (!LIVE_LISTING_STATUSES.includes(String(row.status))) continue;
    const key = String(row.portal);
    const definition = getPortalDefinition(key);
    blockers.set(key, {
      kind: "portal",
      id: key,
      name: definition?.display_name ?? key,
      status: String(row.status ?? "published"),
      publicUrl: row.public_url ?? null,
    });
  }
  for (const row of publications ?? []) {
    if (row.enabled !== true) continue;
    const key = String(row.portal_key);
    if (blockers.has(key)) continue;
    const definition = getPortalDefinition(key);
    blockers.set(key, {
      kind: "portal",
      id: key,
      name: definition?.display_name ?? key,
      status: "selected",
      publicUrl: null,
    });
  }

  const result = [...blockers.values()];
  if (collaboration === true) {
    result.push({
      kind: "collaboration",
      id: "habitoo_collaboration",
      name: "Colaborare Habitoo",
      status: "published",
      publicUrl: null,
    });
  }
  return result;
}

/** Starea de arhivare: dacă se poate și, dacă nu, exact ce o blochează. */
export const getPropertyArchiveState = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ propertyId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<PropertyArchiveState> => {
    const actor = await loadActor(context as AuthContext);
    const property = await loadProperty(actor, data.propertyId);
    const archived = String(property.status) === "archived";
    const blockers = archived
      ? []
      : await collectBlockers(property.organization_id, property.id, property.collaboration);

    return {
      propertyId: property.id,
      reference: property.reference ?? null,
      title: property.title,
      status: String(property.status),
      archived,
      canArchive: !archived && blockers.length === 0,
      blockers,
    };
  });

export type ArchiveResult = { ok: true; archived: boolean; reference: string | null; status: string };

export const archiveProperty = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ propertyId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<ArchiveResult> => {
    const actor = await loadActor(context as AuthContext);
    const property = await loadProperty(actor, data.propertyId);
    const admin = await loadAdmin();

    if (String(property.status) === "archived") {
      return { ok: true, archived: true, reference: property.reference ?? null, status: "archived" };
    }

    // Blocajul se re-verifică pe server: interfața poate fi învechită.
    const blockers = await collectBlockers(property.organization_id, property.id, property.collaboration);
    if (blockers.length > 0) {
      throw new Error(
        `Proprietatea este încă activă pe: ${blockers.map((b) => b.name).join(", ")}. Retrage-o de acolo înainte de arhivare.`,
      );
    }

    const archivedAt = new Date().toISOString();
    const { error } = await admin
      .from("properties")
      .update({
        status: "archived",
        archived_at: archivedAt,
        archived_by: actor.userId,
        pre_archive_status: property.status,
      } as never)
      .eq("id", property.id);
    if (error) throw new Error(error.message);

    await admin.from("audit_logs").insert({
      organization_id: property.organization_id,
      actor_id: actor.userId,
      action: "property_archived",
      entity: "property",
      entity_id: property.id,
      old_values: { status: property.status } as never,
      new_values: { status: "archived", archived_at: archivedAt } as never,
    } as never);

    return { ok: true, archived: true, reference: property.reference ?? null, status: "archived" };
  });

export const unarchiveProperty = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ propertyId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<ArchiveResult> => {
    const actor = await loadActor(context as AuthContext);
    const property = await loadProperty(actor, data.propertyId);
    const admin = await loadAdmin();

    if (String(property.status) !== "archived") {
      return { ok: true, archived: false, reference: property.reference ?? null, status: String(property.status) };
    }

    // Se readuce statusul comercial de dinainte de arhivare; dacă lipsește, `draft`.
    const restored = property.pre_archive_status ? String(property.pre_archive_status) : "draft";
    const { error } = await admin
      .from("properties")
      .update({
        status: restored,
        archived_at: null,
        archived_by: null,
        pre_archive_status: null,
      } as never)
      .eq("id", property.id);
    if (error) throw new Error(error.message);

    await admin.from("audit_logs").insert({
      organization_id: property.organization_id,
      actor_id: actor.userId,
      action: "property_unarchived",
      entity: "property",
      entity_id: property.id,
      old_values: { status: "archived" } as never,
      new_values: { status: restored, unarchived_at: new Date().toISOString() } as never,
    } as never);

    return { ok: true, archived: false, reference: property.reference ?? null, status: restored };
  });
