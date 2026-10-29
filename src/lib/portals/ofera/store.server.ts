import { decryptPortalCredential, encryptPortalCredential } from "../crypto.server";
import type { OferaToken, OferaTokenStore } from "./auth.server";
import type { OferaLog } from "./transport.server";
import { oferaRedact } from "./response";
export async function createOferaStore(organizationId: string): Promise<{ store: OferaTokenStore; journal: (entry: OferaLog) => Promise<void> }> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const store: OferaTokenStore = {
    async read() {
      const { data, error } = await db.from("ofera_partner_auth").select("token_encrypted,expires_at,scope,revision").eq("singleton", true).maybeSingle();
      if (error) throw new Error("Autorizarea Ofera nu poate fi citită.");
      if (!data?.token_encrypted || !data.expires_at || !data.revision) return null;
      const token = decryptPortalCredential(data.token_encrypted);
      return token ? { token, expiresAt: Date.parse(data.expires_at), scope: data.scope ?? "", revision: data.revision } : null;
    },
    async claim(owner, rejectedRevision) {
      const { data, error } = await db.rpc("ofera_token_claim", { p_owner: owner, ...(rejectedRevision ? { p_rejected_revision: rejectedRevision } : {}) });
      if (error) throw new Error("Autorizarea Ofera nu poate fi rezervată.");
      return data === true;
    },
    async save(owner: string, token: OferaToken) {
      const { data, error } = await db.from("ofera_partner_auth").update({ token_encrypted: encryptPortalCredential(token.token), expires_at: new Date(token.expiresAt).toISOString(), scope: oferaRedact(JSON.stringify(token.scope), [token.token]).slice(1, -1), revision: token.revision }).eq("singleton", true).eq("lock_owner", owner).gt("lock_until", new Date().toISOString()).select("singleton");
      if (error) throw new Error("Autorizarea Ofera nu a putut fi salvată.");
      return Boolean(data?.length);
    },
    async release(owner) {
      const { error } = await db.from("ofera_partner_auth").update({ lock_owner: null, lock_until: null }).eq("singleton", true).eq("lock_owner", owner);
      if (error) throw new Error("Rezervarea autorizării Ofera nu a putut fi închisă.");
    },
  };
  return { store, async journal(entry) {
    const { error } = await db.from("ofera_api_logs").insert({ organization_id: organizationId, path: entry.path, http_status: entry.httpStatus, body_status: entry.result.status, success: entry.result.ok, message: entry.result.message, log_track_id: entry.result.logTrackId, raw_response: entry.raw });
    if (error) throw new Error("Apelul Ofera nu a putut fi jurnalizat.");
  } };
}