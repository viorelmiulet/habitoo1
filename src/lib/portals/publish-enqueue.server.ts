/**
 * Înscrierea joburilor de publicare: un job per portal, răspuns imediat.
 * Validările rapide aici; validarea completă (date curente, sloturi) se
 * reface la execuție în worker.
 */
import { getPortalDefinition, portalCanPublish, publishUnavailableMessage, portalDisplayName, type PortalId } from "./registry";
import { imobiliarePortalDecidesSlots, type ImobiliarePublicationMode } from "./imobiliare/card-promotions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export type EnqueueInput = {
  organizationId: string;
  superadmin: boolean;
  actorId: string;
  data: {
    propertyId: string;
    selections: { portalId: string; enabled: boolean; promoted?: boolean; imobiliarePromotions?: import("./imobiliare/card-promotions").ImobiliarePromotionChanges; imobiliareMode?: ImobiliarePublicationMode }[];
    syncExisting: boolean;
  };
  loadAdmin: () => Promise<Admin>;
  activatedPortalIds: (organizationId: string) => Promise<Set<string>>;
  /** Pornit de o programare: nu anulează programarea care rulează. */
  fromSchedule?: boolean;
};

export async function enqueuePublishJobsForOrg(input: EnqueueInput) {
  const admin = await input.loadAdmin();
  const allowed = input.superadmin ? null : await input.activatedPortalIds(input.organizationId);
  const { data: publications } = await admin
    .from("portal_publications")
    .select("portal_key, enabled, imobiliare_mode")
    .eq("organization_id", input.organizationId)
    .eq("property_id", input.data.propertyId);
  const previous = new Map<string, boolean>(
    ((publications ?? []) as { portal_key: string; enabled: boolean }[]).map((p) => [
      p.portal_key,
      p.enabled === true,
    ]),
  );

  const results: { portalId: string; portalName: string; queued: boolean; message: string | null }[] = [];
  const pending: {
    portalId: string;
    name: string;
    row: Record<string, unknown>;
    wanted: EnqueueInput["data"]["selections"][number];
    wasEnabled: boolean;
  }[] = [];

  for (const wanted of input.data.selections) {
    const definition = getPortalDefinition(wanted.portalId);
    if (!definition) continue;
    const name = portalDisplayName(definition.id as PortalId);
    const wasEnabled = previous.get(definition.id) ?? false;
    if (!wanted.enabled && !wasEnabled) continue;

    if (wanted.enabled && allowed !== null && !allowed.has(definition.id)) {
      results.push({ portalId: definition.id, portalName: name, queued: false, message: `${name} nu este activat pentru agenția ta.` });
      continue;
    }
    if (wanted.enabled && !portalCanPublish(definition.id)) {
      results.push({ portalId: definition.id, portalName: name, queued: false, message: publishUnavailableMessage(definition.id) });
      continue;
    }
    if (wanted.enabled && definition.status !== "available") {
      results.push({ portalId: definition.id, portalName: name, queued: false, message: `Integrarea ${name} nu este încă disponibilă.` });
      continue;
    }
    const savedMode = (publications ?? []).find((p: { portal_key: string }) => p.portal_key === definition.id)?.imobiliare_mode;
    const mode = wanted.imobiliareMode ?? (savedMode === "imoradar_only" ? "imoradar_only" : undefined);
    if (wanted.enabled && !wasEnabled && !imobiliarePortalDecidesSlots(definition.id, mode, wanted.imobiliarePromotions)) {
      const { ensurePortalSlotAvailable } = await import("./slots.server");
      const guard = await ensurePortalSlotAvailable(admin, {
        organizationId: input.organizationId,
        portalKey: definition.id,
        portalName: name,
        propertyId: input.data.propertyId,
        actorId: input.actorId,
      });
      if (!guard.ok) {
        results.push({ portalId: definition.id, portalName: name, queued: false, message: guard.message });
        continue;
      }
    }

    pending.push({
      portalId: definition.id,
      name,
      row: {
        portal_key: definition.id,
        enabled: wanted.enabled,
        promoted: wanted.promoted ?? null,
        imobiliare_promotions: definition.id === "imobiliare_ro" ? wanted.imobiliarePromotions ?? null : null,
        imobiliare_mode: definition.id === "imobiliare_ro" ? mode ?? null : null,
      },
      wanted,
      wasEnabled,
    });
  }

  // O singură tranzacție: toate joburile portalurilor și armarea workerului.
  if (pending.length > 0) {
    const { data: keys, error } = await admin.rpc("start_portal_publish_jobs", {
      _org: input.organizationId,
      _property: input.data.propertyId,
      _actor: input.actorId,
      _superadmin: input.superadmin,
      _sync_existing: input.data.syncExisting,
      _jobs: pending.map((p) => p.row),
    });
    if (error) {
      for (const p of pending) results.push({ portalId: p.portalId, portalName: p.name, queued: false, message: `${p.name}: nu a putut fi pus în coadă.` });
      return { results };
    }
    const queuedKeys = new Set<string>((keys ?? []) as string[]);
    for (const p of pending) {
      if (!queuedKeys.has(p.portalId)) {
        results.push({ portalId: p.portalId, portalName: p.name, queued: false, message: `${p.name}: se sincronizează deja.` });
        continue;
      }
      if (p.portalId === "imobiliare_ro" && typeof p.wanted.imobiliarePromotions?.promote_imoradar === "boolean") {
        // Persist the explicit per-listing preference with publication, not on checkbox clicks.
        const { error: preferenceError } = await admin.from("portal_publications").upsert({
          organization_id: input.organizationId,
          property_id: input.data.propertyId,
          portal_key: p.portalId,
          enabled: p.wasEnabled,
          imoradar_opt_out: !p.wanted.imobiliarePromotions.promote_imoradar,
          created_by: input.actorId,
          updated_by: input.actorId,
        }, { onConflict: "organization_id,property_id,portal_key" });
        if (preferenceError) console.error("[portal-publish] imoradar preference could not be persisted");
      }
      results.push({ portalId: p.portalId, portalName: p.name, queued: true, message: null });
    }
  }

  // Publicarea manuală sau debifarea anulează programarea activă a portalului.
  if (!input.fromSchedule) {
    const touched = results.filter((r) => r.queued).map((r) => r.portalId);
    const unchecked = input.data.selections.filter((s) => !s.enabled).map((s) => s.portalId);
    const keys = [...new Set([...touched, ...unchecked])];
    if (keys.length > 0) {
      const { cancelActiveSchedules } = await import("./publish-schedule.server");
      await cancelActiveSchedules(admin, {
        organizationId: input.organizationId,
        propertyId: input.data.propertyId,
        portalKeys: keys,
        actorId: input.actorId,
        reason: unchecked.length > 0 && touched.length === 0 ? "Portal debifat înainte de oră." : "Publicat manual înainte de oră.",
      }).catch((e: unknown) => console.error("[portal-schedule] anularea a eșuat", String(e).slice(0, 200)));
    }
  }

  return { results };
}
