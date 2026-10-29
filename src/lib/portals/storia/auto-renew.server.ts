import { isPropertyFeedEligible } from "@/lib/site-feed/mapper";
import { storiaContentUpdateEligible } from "./auto-renew";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];
type Scope = { organizationId: string; propertyId: string };

async function canUpdate(admin: Admin, input: Scope): Promise<boolean> {
  const [{ data: property, error: propertyError }, { data: listing, error: listingError }, { data: publication, error: publicationError }, { data: connection, error: connectionError }] = await Promise.all([
    admin.from("properties").select("*").eq("organization_id", input.organizationId).eq("id", input.propertyId).maybeSingle(),
    admin.from("portal_listings").select("status,external_id").eq("organization_id", input.organizationId).eq("property_id", input.propertyId).eq("portal", "storia").maybeSingle(),
    admin.from("portal_publications").select("enabled").eq("organization_id", input.organizationId).eq("property_id", input.propertyId).eq("portal_key", "storia").maybeSingle(),
    admin.from("portal_connections").select("activated").eq("organization_id", input.organizationId).eq("portal", "storia").maybeSingle(),
  ]);
  const error = propertyError ?? listingError ?? publicationError ?? connectionError;
  if (error) throw new Error(error.message);
  return Boolean(property && !property.archived_at && isPropertyFeedEligible(property) && publication?.enabled === true && connection?.activated === true && storiaContentUpdateEligible(listing?.status, listing?.external_id));
}

/** Reuse the atomic queue start and its durable follow-up on a busy pair. */
export async function enqueueStoriaAutoRenewUpdate(admin: Admin, input: Scope & { actorId: string; superadmin: boolean }): Promise<boolean> {
  if (!await canUpdate(admin, input)) return false;
  const { error } = await admin.rpc("start_portal_contact_updates", {
    _org: input.organizationId, _actor: input.actorId, _superadmin: input.superadmin,
    _pairs: [{ property_id: input.propertyId, portal_key: "storia", next_attempt_at: new Date().toISOString() }],
  });
  if (error) throw new Error(error.message);
  return true;
}

/** Revalidate local state when claimed; the adapter also checks each remote advert. */
export async function runStoriaContentUpdateJob(admin: Admin, job: { organization_id: string; property_id: string; requested_by: string }, execute: (input: {
  organizationId: string; propertyId: string; portalId: string; actorId: string;
  action: "update"; operationLabel: string; skipSlotCheck: true;
}) => Promise<{ ok: boolean; message?: string | null; code?: string | null; httpStatus?: number | null }>) {
  if (!await canUpdate(admin, { organizationId: job.organization_id, propertyId: job.property_id })) {
    return { portalId: "storia", ok: true, action: "skipped", message: "Salvat. Se aplică la următoarea publicare făcută de agent." };
  }
  const result = await execute({ organizationId: job.organization_id, propertyId: job.property_id, portalId: "storia", actorId: job.requested_by, action: "update", operationLabel: "update", skipSlotCheck: true });
  return { ...result, portalId: "storia", action: result.ok ? "updated" : "blocked", message: result.message ?? (result.ok ? "Opțiunea a fost trimisă la Storia." : "Trimiterea la Storia a eșuat.") };
}