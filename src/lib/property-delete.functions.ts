/**
 * Ștergerea definitivă a unei proprietăți.
 *
 * Regula de siguranță: o proprietate NU poate fi ștearsă cât timp are anunțuri
 * active pe portaluri sau este oferită în Colaborare. Fără identificatorii
 * externi păstrați în CRM nu am mai putea retrage niciodată anunțurile, deci
 * ștergerea ar lăsa oferte online permanent, fără control.
 *
 * Retragerea NU este automatizată în interiorul ștergerii: utilizatorul vede
 * exact ce se retrage și confirmă separat, cu fluxul de retragere existent.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { getPortalDefinition } from "@/lib/portals/registry";

const MEDIA_BUCKET = "property-media";
const DOCS_BUCKET = "crm-documents";

/** Stările în care anunțul este (sau poate deveni) vizibil pe portal. */
const LIVE_LISTING_STATUSES = ["published", "updated", "pending"];

type AuthContext = { userId: string };

export type PropertyDeletionBlocker = {
  kind: "portal" | "collaboration";
  id: string;
  name: string;
  status: string;
  publicUrl: string | null;
};

export type PropertyDeletionState = {
  propertyId: string;
  reference: string | null;
  title: string;
  status: string;
  allowed: boolean;
  canDelete: boolean;
  blockers: PropertyDeletionBlocker[];
  counts: {
    images: number;
    documents: number;
    leads: number;
    activities: number;
    proposals: number;
    favorites: number;
  };
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
 * Verificarea reală de drepturi (server-side): administratorul agenției poate
 * șterge orice proprietate a agenției, agentul doar pe cele asignate lui.
 */
async function loadDeletableProperty(actor: Actor, propertyId: string) {
  const admin = await loadAdmin();
  const { data: property, error } = await admin
    .from("properties")
    .select("id, organization_id, reference, title, status, assigned_to, collaboration")
    .eq("id", propertyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!property) throw new Error("Proprietatea nu există.");
  if (!actor.isSuperadmin) {
    if (!actor.organizationId || property.organization_id !== actor.organizationId) {
      throw new Error("Proprietatea nu aparține agenției tale.");
    }
    if (!actor.isAdmin && property.assigned_to !== actor.userId) {
      throw new Error("Poți șterge doar proprietățile care îți sunt asignate.");
    }
  }
  return property;
}

async function collectBlockers(
  organizationId: string,
  propertyId: string,
  collaboration: boolean | null,
): Promise<PropertyDeletionBlocker[]> {
  const admin = await loadAdmin();
  const [{ data: listings }, { data: publications }] = await Promise.all([
    admin
      .from("portal_listings")
      .select("portal, status, external_id, public_url")
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId),
    admin
      .from("portal_publications")
      .select("portal_key, enabled")
      .eq("organization_id", organizationId)
      .eq("property_id", propertyId),
  ]);

  const blockers = new Map<string, PropertyDeletionBlocker>();
  for (const row of listings ?? []) {
    const live = LIVE_LISTING_STATUSES.includes(String(row.status)) || Boolean(row.external_id);
    if (!live) continue;
    const definition = getPortalDefinition(String(row.portal));
    blockers.set(String(row.portal), {
      kind: "portal",
      id: String(row.portal),
      name: definition?.display_name ?? String(row.portal),
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

/** Starea de siguranță a ștergerii: ce blochează și ce se pierde. */
export const getPropertyDeletionState = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ propertyId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<PropertyDeletionState> => {
    const actor = await loadActor(context as AuthContext);
    const property = await loadDeletableProperty(actor, data.propertyId);
    const admin = await loadAdmin();

    const [images, documents, leads, activities, proposals, favorites] = await Promise.all([
      admin.from("property_images").select("id", { count: "exact", head: true }).eq("property_id", property.id),
      admin
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("entity_type", "property")
        .eq("entity_id", property.id),
      admin.from("leads").select("id", { count: "exact", head: true }).eq("property_id", property.id),
      admin.from("activities").select("id", { count: "exact", head: true }).eq("property_id", property.id),
      admin
        .from("collaboration_proposals")
        .select("id", { count: "exact", head: true })
        .eq("property_id", property.id),
      admin
        .from("property_favorites")
        .select("id", { count: "exact", head: true })
        .eq("property_id", property.id),
    ]);

    const blockers = await collectBlockers(property.organization_id, property.id, property.collaboration);

    return {
      propertyId: property.id,
      reference: property.reference ?? null,
      title: property.title,
      status: String(property.status),
      allowed: true,
      canDelete: blockers.length === 0,
      blockers,
      counts: {
        images: images.count ?? 0,
        documents: documents.count ?? 0,
        leads: leads.count ?? 0,
        activities: activities.count ?? 0,
        proposals: proposals.count ?? 0,
        favorites: favorites.count ?? 0,
      },
    };
  });

export type DeletePropertyResult = {
  ok: true;
  reference: string | null;
  removed: {
    images: number;
    documents: number;
    storageFiles: number;
    activitiesDeleted: number;
    leadsUnlinked: number;
  };
};

export const deletePropertyPermanently = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) =>
    z.object({ propertyId: z.string().uuid(), confirmReference: z.string().trim().min(1) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<DeletePropertyResult> => {
    const actor = await loadActor(context as AuthContext);
    const property = await loadDeletableProperty(actor, data.propertyId);
    const admin = await loadAdmin();

    const expected = (property.reference ?? property.id).trim();
    if (data.confirmReference.trim().toUpperCase() !== expected.toUpperCase()) {
      throw new Error("Referința tastată nu corespunde proprietății.");
    }

    // Blocajul se re-verifică pe server: UI-ul poate fi învechit.
    const blockers = await collectBlockers(property.organization_id, property.id, property.collaboration);
    if (blockers.length > 0) {
      throw new Error(
        `Proprietatea este încă activă pe: ${blockers.map((b) => b.name).join(", ")}. Retrage-o de acolo înainte de ștergere.`,
      );
    }

    const [{ data: images }, { data: documents }, { data: leads }] = await Promise.all([
      admin.from("property_images").select("id, storage_path").eq("property_id", property.id),
      admin
        .from("documents")
        .select("id, storage_path")
        .eq("entity_type", "property")
        .eq("entity_id", property.id),
      admin.from("leads").select("id, stage, notes").eq("property_id", property.id),
    ]);

    // Urma în audit se scrie ÎNAINTE de ștergere. `audit_logs.entity_id` nu are
    // cheie externă spre `properties`, deci intrarea supraviețuiește ștergerii.
    await admin.from("audit_logs").insert({
      organization_id: property.organization_id,
      actor_id: actor.userId,
      action: "property_deleted",
      entity: "property",
      entity_id: property.id,
      old_values: {
        reference: property.reference,
        title: property.title,
        status: property.status,
      } as never,
      new_values: {
        deleted_at: new Date().toISOString(),
        images: (images ?? []).length,
        documents: (documents ?? []).length,
        leads_unlinked: (leads ?? []).length,
      } as never,
    } as never);

    // 1. Fișierele din storage: fotografiile, variantele cu watermark și documentele.
    const imagePaths = (images ?? []).map((i) => i.storage_path).filter((p): p is string => Boolean(p));
    const watermarkPaths: string[] = [];
    if (imagePaths.length > 0) {
      const { data: hashes } = await admin.storage.from(MEDIA_BUCKET).list("watermarked");
      for (const folder of hashes ?? []) {
        for (const path of imagePaths) watermarkPaths.push(`watermarked/${folder.name}/${path}`);
      }
    }
    const mediaPaths = [...imagePaths, ...watermarkPaths];
    if (mediaPaths.length > 0) await admin.storage.from(MEDIA_BUCKET).remove(mediaPaths);
    const docPaths = (documents ?? []).map((d) => d.storage_path).filter((p): p is string => Boolean(p));
    if (docPaths.length > 0) await admin.storage.from(DOCS_BUCKET).remove(docPaths);

    // 2. Lead-urile NU se șterg: clientul rămâne valoros și după dispariția
    // ofertei. Se dezleagă de proprietate și primesc o urmă în istoric.
    for (const lead of leads ?? []) {
      await admin.from("leads").update({ property_id: null, updated_by: actor.userId } as never).eq("id", lead.id);
      await admin.from("lead_events").insert({
        organization_id: property.organization_id,
        lead_id: lead.id,
        from_stage: lead.stage,
        to_stage: lead.stage,
        note: `Proprietatea ${property.reference ?? ""} („${property.title}”) a fost ștearsă definitiv din CRM.`.trim(),
        actor_id: actor.userId,
      } as never);
    }

    // 3. Activitățile strict legate de proprietate se șterg; cele legate și de
    // un lead sau un contact se păstrează, dezlegate de proprietate.
    const { data: deletedActivities } = await admin
      .from("activities")
      .delete()
      .eq("property_id", property.id)
      .is("lead_id", null)
      .is("contact_id", null)
      .select("id");
    await admin
      .from("activities")
      .update({ property_id: null, updated_by: actor.userId } as never)
      .eq("property_id", property.id);

    // 4. Documentele nu au cheie externă spre proprietate — se șterg explicit.
    await admin.from("documents").delete().eq("entity_type", "property").eq("entity_id", property.id);

    // 5. Restul (fotografii, portal_listings, portal_publications, propuneri de
    // colaborare, favorite, vizite) cade prin ON DELETE CASCADE.
    const { error } = await admin.from("properties").delete().eq("id", property.id);
    if (error) throw new Error(error.message);

    return {
      ok: true,
      reference: property.reference ?? null,
      removed: {
        images: (images ?? []).length,
        documents: (documents ?? []).length,
        storageFiles: mediaPaths.length + docPaths.length,
        activitiesDeleted: (deletedActivities ?? []).length,
        leadsUnlinked: (leads ?? []).length,
      },
    };
  });
