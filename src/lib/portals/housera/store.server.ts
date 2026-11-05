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

export async function houseraOAuthDependencies() {
  const admin = await db();
  const { encryptPortalCredential, decryptPortalCredential } = await import("../crypto.server");
  const { houseraConnectionPatch } = await import("./oauth.server");
  type Deps = import("./oauth.server").HouseraOAuthDeps;
  const store: Deps["store"] = {
    async insertState(r) {
      const { error } = await admin.from("portal_oauth_states").insert({
        portal: "housera", organization_id: r.organizationId, created_by: r.createdBy,
        state_hash: r.hash, expires_at: r.expiresAt, code_verifier_encrypted: r.verifierEncrypted,
      });
      if (error) throw new Error("Conectarea Housera nu a putut porni.");
    },
    async consumeState(hash, now) {
      const { data: row } = await admin.from("portal_oauth_states")
        .select("id, organization_id, created_by, code_verifier_encrypted")
        .eq("portal", "housera").eq("state_hash", hash).is("consumed_at", null).gt("expires_at", now).maybeSingle();
      if (!row) return null;
      const { data: won } = await admin.from("portal_oauth_states")
        .update({ consumed_at: now, code_verifier_encrypted: null })
        .eq("id", row.id).is("consumed_at", null).select("id").maybeSingle();
      if (!won) return null;
      return { organizationId: row.organization_id, createdBy: row.created_by, verifierEncrypted: row.code_verifier_encrypted };
    },
  };
  const deps: Deps = { store, encrypt: encryptPortalCredential, decrypt: decryptPortalCredential, env: process.env };
  async function saveTokens(org: string, t: import("./oauth.server").HouseraTokens, actor: string | null) {
    const row = await loadHouseraConnection(org);
    const patch = { ...houseraConnectionPatch(t, row?.settings ?? {}, encryptPortalCredential, new Date().toISOString()), updated_by: actor };
    const { error } = row
      ? await admin.from("portal_connections").update({ ...patch, settings: patch.settings as never }).eq("id", row.id)
      : await admin.from("portal_connections").insert({ ...patch, settings: patch.settings as never, organization_id: org, portal: "housera", created_by: actor });
    if (error) throw new Error("Conexiunea Housera nu a putut fi salvată.");
  }
  return { deps, saveTokens };
}

/** Șterge cheia din Habitoo (revocarea completă se face în Housera). */
export async function clearHouseraKey(organizationId: string, actor: string): Promise<void> {
  const row = await loadHouseraConnection(organizationId);
  if (!row) return;
  const settings = { ...(row.settings ?? {}) };
  delete settings["oauth"]; delete settings["reconnect_required"];
  const { error } = await (await db()).from("portal_connections").update({
    portal_credentials_encrypted: null, external_account_id: null, status: "disconnected",
    last_sync_status: null, last_sync_error: null, settings: settings as never, updated_by: actor,
  }).eq("id", row.id);
  if (error) throw new Error("Conexiunea Housera nu a putut fi ștearsă.");
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
