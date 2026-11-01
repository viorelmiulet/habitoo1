/**
 * Server-only storage for each app user's connector connection key.
 *
 * The key is kept encrypted (see connectionKeyCrypto.server.ts) in
 * `public.app_user_connections`, which has RLS with no policies: only the
 * service-role client used here can read or write it. Browser code never
 * receives the key, only the outcome of a provider call.
 */
import { decryptConnectionKey, encryptConnectionKey } from "@/lib/connectionKeyCrypto.server";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabaseAdmin as any;
}

export async function saveConnectionKeyForUser(
  userId: string,
  connectorId: string,
  connectionAPIKey: string,
) {
  const { error } = await (await db())
    .from("app_user_connections")
    .upsert(
      {
        user_id: userId,
        connector_id: connectorId,
        connection_key_ciphertext: encryptConnectionKey(connectionAPIKey),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,connector_id" },
    );
  if (error) throw error;
}

export async function getConnectionKeyForUser(userId: string, connectorId: string) {
  const { data, error } = await (await db())
    .from("app_user_connections")
    .select("connection_key_ciphertext")
    .eq("user_id", userId)
    .eq("connector_id", connectorId)
    .maybeSingle();
  if (error) throw error;
  return data ? decryptConnectionKey(data.connection_key_ciphertext) : null;
}

export async function deleteConnectionKeyForUser(userId: string, connectorId: string) {
  const { error } = await (await db())
    .from("app_user_connections")
    .delete()
    .eq("user_id", userId)
    .eq("connector_id", connectorId);
  if (error) throw error;
}
