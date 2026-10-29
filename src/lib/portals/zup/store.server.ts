import type { ZupDeps, ZupStore } from "./oauth.server";
import { PortalError } from "../errors";
export async function zupDependencies(): Promise<ZupDeps> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { encryptPortalCredential, decryptPortalCredential } = await import("../crypto.server");
  const checked = (error: unknown) => { if (error) throw new PortalError("CONFIG_ERROR", "zup_storage", "Conexiunea ZUP nu a putut fi salvată."); };
  const store: ZupStore = {
    async insertState(r) {
      const { error } = await db.from("portal_oauth_states").insert({ portal: "zup", organization_id: r.organizationId, created_by: r.createdBy, state_hash: r.hash, expires_at: r.expiresAt }); checked(error);
    },
    async consumeState(hash, now) {
      const { data, error } = await db.from("portal_oauth_states").update({ consumed_at: now }).eq("portal", "zup").eq("state_hash", hash).is("consumed_at", null).gt("expires_at", now).select("id, organization_id, created_by, expires_at").maybeSingle(); checked(error);
      return data ? { id: data.id, organizationId: data.organization_id, createdBy: data.created_by, expiresAt: data.expires_at } : null;
    },
    async load(org) {
      const { data, error } = await db.from("portal_connections").select("id, portal_credentials_encrypted, settings").eq("organization_id", org).eq("portal", "zup").maybeSingle(); checked(error);
      return data ? { id: data.id, credentials: data.portal_credentials_encrypted, settings: (data.settings ?? {}) as Record<string, unknown> } : null;
    },
    async save(org, credentials, settings, actor, expected) {
      const row = await store.load(org);
      const patch = { organization_id: org, portal: "zup", authentication_mode: "oauth", direction: "habitoo_to_portal", activated: Boolean(credentials), portal_credentials_encrypted: credentials, settings: settings as never, status: credentials ? "connected" : "disconnected", last_sync_error: null, updated_by: actor };
      if (row) {
        let q = db.from("portal_connections").update(patch).eq("id", row.id);
        if (expected !== undefined) q = expected === null ? q.is("portal_credentials_encrypted", null) : q.eq("portal_credentials_encrypted", expected);
        const { data, error } = await q.select("id").maybeSingle(); checked(error); return Boolean(data);
      }
      if (expected !== undefined) return false;
      const { error } = await db.from("portal_connections").insert({ ...patch, created_by: actor }); checked(error); return true;
    },
    async acquire(org, owner) {
      const { data, error } = await db.rpc("acquire_portal_operation_lock", { _organization_id: org, _portal: "zup", _lock_key: "oauth_refresh", _owner_token: owner, _ttl_seconds: 120 }); checked(error); return data === true;
    },
    async release(org, owner) {
      const { error } = await db.rpc("release_portal_operation_lock", { _organization_id: org, _portal: "zup", _lock_key: "oauth_refresh", _owner_token: owner }); checked(error);
    },
  };
  return { store, encrypt: encryptPortalCredential, decrypt: decryptPortalCredential, env: process.env, reserve:async(org)=>{const {data,error}=await db.rpc("zup_reserve_request",{_organization:org});checked(error);return Number(data);} };
}