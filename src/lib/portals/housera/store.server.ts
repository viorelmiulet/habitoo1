/** Persistența conexiunii Housera: cheia criptată în portal_connections. */
import { HOUSERA_RECONNECT_MESSAGE } from "./config";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type HouseraConnectionRow = {
  id: string;
  status: string;
  activated: boolean;
  last_sync_status: string | null;
  last_sync_error: string | null;
  last_sync_at: string | null;
  portal_credentials_encrypted: string | null;
  settings: Record<string, unknown> | null;
};

export async function loadHouseraConnection(organizationId: string): Promise<HouseraConnectionRow | null> {
  const { data, error } = await (await db())
    .from("portal_connections")
    .select("id, status, activated, last_sync_status, last_sync_error, last_sync_at, portal_credentials_encrypted, settings")
    .eq("organization_id", organizationId)
    .eq("portal", "housera")
    .maybeSingle();
  if (error) throw new Error("Conexiunea Housera nu a putut fi citită.");
  return (data as HouseraConnectionRow | null) ?? null;
}

export async function loadHouseraKey(organizationId: string): Promise<string | null> {
  const row = await loadHouseraConnection(organizationId);
  if (!row?.portal_credentials_encrypted) return null;
  const { decryptPortalCredential } = await import("../crypto.server");
  return decryptPortalCredential(row.portal_credentials_encrypted);
}

export async function saveHouseraKey(organizationId: string, key: string, actor: string): Promise<void> {
  const { encryptPortalCredential } = await import("../crypto.server");
  const admin = await db();
  const row = await loadHouseraConnection(organizationId);
  const settings = { ...(row?.settings ?? {}) };
  delete settings["reconnect_required"];
  const patch = {
    portal_credentials_encrypted: encryptPortalCredential(key),
    authentication_mode: "oauth",
    direction: "habitoo_to_portal",
    last_sync_status: null,
    last_sync_error: null,
    settings: settings as never,
    updated_by: actor,
  };
  const { error } = row
    ? await admin.from("portal_connections").update(patch).eq("id", row.id)
    : await admin.from("portal_connections").insert({ ...patch, organization_id: organizationId, portal: "housera", created_by: actor });
  if (error) throw new Error("Cheia Housera nu a putut fi salvată.");
}

/** 401: conexiunea trebuie refăcută de agenție. */
export async function markHouseraReconnect(organizationId: string): Promise<void> {
  const row = await loadHouseraConnection(organizationId);
  if (!row) return;
  await (await db())
    .from("portal_connections")
    .update({
      status: "error",
      last_sync_status: "error",
      last_sync_error: HOUSERA_RECONNECT_MESSAGE,
      last_sync_at: new Date().toISOString(),
      settings: { ...(row.settings ?? {}), reconnect_required: true } as never,
    })
    .eq("id", row.id);
}
