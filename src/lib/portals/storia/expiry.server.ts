import { storiaValidTo } from "./expiry";
type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

/** Informational API valid_to only; never deselects a publication. */
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
