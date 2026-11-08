// Scrieri pentru „Site-ul agenției” (server-only). Fără apeluri externe: site-ul
// citește feedul, deci bifările nu creează joburi de publicare sau republicare.
import { AGENCY_SITE_PORTAL_KEY, agencySiteDisplayName } from "./agency-site";

type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export type AgencySiteRow = {
  organization_id: string;
  site_url: string | null;
  display_name: string;
  active: boolean;
  first_activated_at: string | null;
};

export async function loadAgencySite(admin: AdminClient, organizationId: string): Promise<AgencySiteRow | null> {
  const { data, error } = await admin
    .from("agency_site_portals")
    .select("organization_id, site_url, display_name, active, first_activated_at")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AgencySiteRow | null) ?? null;
}

/** Bifează pentru site toate anunțurile publicate acum care nu au încă o alegere. */
export async function selectAllPublishedForSite(admin: AdminClient, organizationId: string, actorId: string | null): Promise<number> {
  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from("properties")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("publish_status", "published")
      .is("deleted_at", null)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    ids.push(...(data ?? []).map((r: { id: string }) => r.id));
    if (!data || data.length < 1000) break;
  }
  let inserted = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data: existing, error } = await admin
      .from("portal_publications")
      .select("property_id")
      .eq("organization_id", organizationId)
      .eq("portal_key", AGENCY_SITE_PORTAL_KEY)
      .in("property_id", chunk);
    if (error) throw new Error(error.message);
    const have = new Set((existing ?? []).map((r: { property_id: string }) => r.property_id));
    const missing = chunk.filter((id) => !have.has(id));
    if (!missing.length) continue;
    const { error: insErr } = await admin.from("portal_publications").insert(
      missing.map((property_id) => ({
        organization_id: organizationId,
        property_id,
        portal_key: AGENCY_SITE_PORTAL_KEY,
        enabled: true,
        status: "synced",
        created_by: actorId,
        updated_by: actorId,
      })),
    );
    if (insErr) throw new Error(insErr.message);
    inserted += missing.length;
  }
  return inserted;
}

/**
 * Salvează site-ul. La prima activare, toate anunțurile publicate se bifează,
 * ca nimic să nu dispară de pe un site deja conectat.
 */
export async function saveAgencySite(
  admin: AdminClient,
  input: { organizationId: string; actorId: string; siteUrl: string | null; displayName: string | null; active: boolean; agencyName?: string | null },
): Promise<{ site: AgencySiteRow; selected: number }> {
  const current = await loadAgencySite(admin, input.organizationId);
  const firstActivation = input.active && !current?.first_activated_at;
  const row = {
    organization_id: input.organizationId,
    site_url: input.siteUrl,
    display_name: agencySiteDisplayName(input.displayName, input.agencyName).slice(0, 80),
    active: input.active,
    first_activated_at: current?.first_activated_at ?? (input.active ? new Date().toISOString() : null),
    updated_by: input.actorId,
  };
  const { error } = await admin.from("agency_site_portals").upsert(row, { onConflict: "organization_id" });
  if (error) throw new Error("Site-ul agenției nu a putut fi salvat.");
  const selected = firstActivation ? await selectAllPublishedForSite(admin, input.organizationId, input.actorId) : 0;
  await admin.from("audit_logs").insert({
    organization_id: input.organizationId,
    actor_id: input.actorId,
    action: "agency_site.saved",
    entity: "agency_site_portals",
    new_values: { active: row.active, site_url: row.site_url, display_name: row.display_name, auto_selected: selected },
  });
  return { site: { ...row } as AgencySiteRow, selected };
}

/** La generarea cheii: dacă site-ul nu există încă, îl creează activ. */
export async function ensureAgencySite(admin: AdminClient, organizationId: string, actorId: string, agencyName: string | null): Promise<void> {
  const current = await loadAgencySite(admin, organizationId);
  if (current) return;
  await saveAgencySite(admin, { organizationId, actorId, siteUrl: null, displayName: null, active: true, agencyName });
}

/** Bifa/retragerea unui anunț pentru site. Jurnalizată ca la celelalte portaluri. */
export async function setPropertyAgencySiteSelection(
  admin: AdminClient,
  input: { organizationId: string; propertyId: string; enabled: boolean; actorId: string },
): Promise<boolean> {
  const { data: existing, error } = await admin
    .from("portal_publications")
    .select("id, enabled")
    .eq("organization_id", input.organizationId)
    .eq("property_id", input.propertyId)
    .eq("portal_key", AGENCY_SITE_PORTAL_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = existing as { id: string; enabled: boolean } | null;
  if (row && row.enabled === input.enabled) return false;
  if (!row && !input.enabled) {
    // Fără rând = nebifat; înregistrăm explicit retragerea.
    const { error: insErr } = await admin.from("portal_publications").insert({
      organization_id: input.organizationId, property_id: input.propertyId, portal_key: AGENCY_SITE_PORTAL_KEY,
      enabled: false, status: "disabled", withdrawn_at: new Date().toISOString(), withdraw_reason: "manual",
      created_by: input.actorId, updated_by: input.actorId,
    });
    if (insErr) throw new Error(insErr.message);
  } else if (!row) {
    const { error: insErr } = await admin.from("portal_publications").insert({
      organization_id: input.organizationId, property_id: input.propertyId, portal_key: AGENCY_SITE_PORTAL_KEY,
      enabled: true, status: "synced", created_by: input.actorId, updated_by: input.actorId,
    });
    if (insErr) throw new Error(insErr.message);
  } else {
    const { error: upErr } = await admin
      .from("portal_publications")
      .update(input.enabled
        ? { enabled: true, status: "synced", withdrawn_at: null, withdraw_reason: null, updated_by: input.actorId }
        : { enabled: false, status: "disabled", withdrawn_at: new Date().toISOString(), withdraw_reason: "manual", updated_by: input.actorId })
      .eq("id", row.id);
    if (upErr) throw new Error(upErr.message);
  }
  await admin.from("portal_operation_logs").insert({
    organization_id: input.organizationId,
    portal: AGENCY_SITE_PORTAL_KEY,
    property_id: input.propertyId,
    operation: input.enabled ? "publish" : "withdraw",
    success: true,
    actor_id: input.actorId,
  });
  return true;
}
