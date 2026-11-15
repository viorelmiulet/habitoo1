import { storiaValidTo } from "./expiry";
type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

/** No portal transport: all writes and the notification commit atomically. */
export async function recordStoriaExpiry(admin: Admin, input: {
  organizationId: string; propertyId: string; advertUuid: string | null;
  code: string | null; data?: unknown; eventAt?: number | null;
}): Promise<boolean> {
  const { data, error } = await admin.rpc("storia_record_expiry", {
    p_org: input.organizationId, p_property: input.propertyId,
    p_uuid: input.advertUuid ?? undefined, p_code: input.code ?? undefined,
    p_valid_to: storiaValidTo(input.data) ?? undefined,
    p_event_at: input.eventAt ? new Date(input.eventAt).toISOString() : undefined,
  });
  if (error) throw new Error(`Starea expirării Storia nu a putut fi salvată: ${error.message}`);
  return data === true;
}

/** Includes already-expired legacy rows and due dates omitted from /meta. */
export async function reconcileStoredStoriaExpiry(admin: Admin, organizationId: string) {
  let offset = 0;
  for (;;) {
    const { data, error } = await admin.from("portal_listings").select("property_id")
      .eq("organization_id", organizationId).eq("portal", "storia")
      .in("status", ["published", "expired", "withdrawn"])
      .order("id").range(offset, offset + 199);
    if (error) throw error;
    for (const row of data ?? []) await recordStoriaExpiry(admin, {
      organizationId, propertyId: row.property_id, advertUuid: null, code: null,
    });
    if (!data || data.length < 200) break;
    offset += 200;
  }
}