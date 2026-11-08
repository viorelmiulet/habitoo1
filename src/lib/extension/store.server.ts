import type { ExtensionStore } from "./core";
import { EXTENSION_RATE_LIMIT } from "./core";

export async function extensionStore(): Promise<ExtensionStore> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  return {
    token: async (hash) => {
      const { data, error } = await db.from("extension_tokens").select("id,user_id,organization_id,token_hash,revoked_at").eq("token_hash", hash).maybeSingle();
      if (error) throw error; return data;
    },
    account: async (userId) => {
      const { data: p, error } = await db.from("profiles").select("full_name,is_active,organization_id").eq("id", userId).maybeSingle();
      if (error) throw error; if (!p) return null;
      const [{ data: roles }, { data: org }] = await Promise.all([
        db.from("user_roles").select("role").eq("user_id", userId),
        p.organization_id ? db.from("organizations").select("id,name,logo_url,status,archived_at,suspended_reason").eq("id", p.organization_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const list = (roles ?? []).map((r) => r.role as string);
      const role = ["superadmin", "agency_admin", "manager", "agent"].find((r) => list.includes(r)) ?? list[0] ?? "agent";
      return { is_active: p.is_active, full_name: p.full_name, role, org: org ?? null, profile_org_id: p.organization_id };
    },
    rate: async (id) => {
      const { data, error } = await db.rpc("extension_rate_take", { _token_id: id, _limit: EXTENSION_RATE_LIMIT });
      if (error) throw error; return data as never;
    },
    touch: async (id) => { await db.from("extension_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", id); },
    revoke: async (id) => { await db.from("extension_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id).is("revoked_at", null); },
  };
}
