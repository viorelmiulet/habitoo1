/**
 * Înscrierea joburilor de publicare: un job per portal, răspuns imediat.
 * Validările rapide aici; validarea completă (date curente, sloturi) se
 * reface la execuție în worker.
 */
import { getPortalDefinition, portalCanPublish, publishUnavailableMessage, portalDisplayName, type PortalId } from "./registry";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export type EnqueueInput = {
  organizationId: string;
  superadmin: boolean;
  actorId: string;
  data: {
    propertyId: string;
    selections: { portalId: string; enabled: boolean; promoted?: boolean }[];
    syncExisting: boolean;
  };
  loadAdmin: () => Promise<Admin>;
  activatedPortalIds: (organizationId: string) => Promise<Set<string>>;
};

export async function enqueuePublishJobsForOrg(input: EnqueueInput) {
  const admin = await input.loadAdmin();
  const allowed = input.superadmin ? null : await input.activatedPortalIds(input.organizationId);
  const { data: publications } = await admin
    .from("portal_publications")
    .select("portal_key, enabled")
    .eq("organization_id", input.organizationId)
    .eq("property_id", input.data.propertyId);
  const previous = new Map<string, boolean>(
    ((publications ?? []) as { portal_key: string; enabled: boolean }[]).map((p) => [
      p.portal_key,
      p.enabled === true,
    ]),
  );

  const results: { portalId: string; portalName: string; queued: boolean; message: string | null }[] = [];
  let inserted = 0;

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
    if (wanted.enabled && !wasEnabled) {
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

    const { error } = await admin.from("portal_publish_jobs").insert({
      organization_id: input.organizationId,
      property_id: input.data.propertyId,
      portal_key: definition.id,
      enabled: wanted.enabled,
      promoted: wanted.promoted ?? null,
      sync_existing: input.data.syncExisting,
      requested_by: input.actorId,
      superadmin: input.superadmin,
    });
    if (error) {
      const busy = (error as { code?: string }).code === "23505";
      results.push({
        portalId: definition.id,
        portalName: name,
        queued: false,
        message: busy ? `${name}: se sincronizează deja.` : `${name}: nu a putut fi pus în coadă.`,
      });
      continue;
    }
    inserted += 1;
    results.push({ portalId: definition.id, portalName: name, queued: true, message: null });
  }

  // Pornește workerul imediat (cerere asincronă din baza de date) și armează
  // verificarea de rezervă cât timp există joburi active.
  if (inserted > 0) {
    const { error } = await admin.rpc("portal_publish_arm");
    if (error) console.error("[portal-publish] armarea a eșuat", error.message);
  }
  return { results };
}
